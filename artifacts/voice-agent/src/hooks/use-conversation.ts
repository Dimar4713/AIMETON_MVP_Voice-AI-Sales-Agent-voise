import { useCallback, useRef } from 'react';
import {
  AudioPlaybackQueue,
  arrayBufferToBase64,
  decodeBase64Pcm16,
} from '@/lib/audio-queue';
import type { AppState } from '@/hooks/use-app-state';

interface ElevenLabsMessage {
  type: string;
  user_transcription_event?: { user_transcript?: string };
  agent_response_event?: { agent_response?: string };
  agent_response_correction_event?: { corrected_agent_response?: string };
  audio_event?: { audio_base_64?: string; event_id?: number };
  ping_event?: { event_id?: number; ping_ms?: number };
  interruption_event?: { reason?: string };
}

/**
 * Owns the ElevenLabs realtime conversation: websocket lifecycle,
 * microphone capture, outbound audio streaming, and inbound audio
 * playback. All state transitions are reported through `appState`.
 */
export function useConversation(appState: AppState) {
  const { addLog, setCallStatus } = appState;

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playbackQueueRef = useRef<AudioPlaybackQueue | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const cleanup = useCallback(() => {
    try {
      processorRef.current?.disconnect();
    } catch {
      /* noop */
    }
    try {
      sourceRef.current?.disconnect();
    } catch {
      /* noop */
    }
    processorRef.current = null;
    sourceRef.current = null;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => undefined);
    }
    audioContextRef.current = null;

    playbackQueueRef.current?.clear();
    if (playbackCtxRef.current && playbackCtxRef.current.state !== 'closed') {
      playbackCtxRef.current.close().catch(() => undefined);
    }
    playbackCtxRef.current = null;
    playbackQueueRef.current = null;

    if (wsRef.current) {
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
  }, []);

  const handleServerMessage = useCallback(
    async (raw: string) => {
      let msg: ElevenLabsMessage;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      switch (msg.type) {
        case 'ping': {
          const eventId = msg.ping_event?.event_id;
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({ type: 'pong', event_id: eventId }),
            );
          }
          break;
        }
        case 'user_transcript': {
          const text = msg.user_transcription_event?.user_transcript;
          if (text) addLog('info', `Клиент: ${text}`);
          break;
        }
        case 'agent_response': {
          const text = msg.agent_response_event?.agent_response;
          if (text) addLog('info', `Агент: ${text}`);
          break;
        }
        case 'agent_response_correction': {
          const text = msg.agent_response_correction_event?.corrected_agent_response;
          if (text) addLog('info', `Агент (исправлено): ${text}`);
          break;
        }
        case 'audio': {
          const b64 = msg.audio_event?.audio_base_64;
          if (b64 && playbackCtxRef.current && playbackQueueRef.current) {
            try {
              const buffer = await decodeBase64Pcm16(
                playbackCtxRef.current,
                b64,
              );
              playbackQueueRef.current.enqueue(buffer);
            } catch (err) {
              addLog('error', 'Не удалось декодировать аудиофрагмент');
            }
          }
          break;
        }
        case 'interruption': {
          playbackQueueRef.current?.clear();
          addLog('warn', 'Разговор прерван — очередь воспроизведения очищена');
          break;
        }
        default:
          break;
      }
    },
    [addLog],
  );

  const startCall = useCallback(
    async (signedUrl: string) => {
      try {
        setCallStatus('requesting-mic');
        addLog('info', 'Запрашиваем доступ к микрофону...');

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        mediaStreamRef.current = stream;
        addLog('info', 'Доступ к микрофону получен');

        setCallStatus('connecting');
        addLog('info', 'Устанавливаем соединение с ElevenLabs...');

        const AudioContextCtor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;

        const audioContext = new AudioContextCtor();
        audioContextRef.current = audioContext;

        const playbackCtx = new AudioContextCtor();
        playbackCtxRef.current = playbackCtx;
        playbackQueueRef.current = new AudioPlaybackQueue(playbackCtx);

        const ws = new WebSocket(signedUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setCallStatus('active');
          addLog('info', 'Соединение установлено — разговор активен');

          const source = audioContext.createMediaStreamSource(stream);
          sourceRef.current = source;
          const processor = audioContext.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          processor.onaudioprocess = (event) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const input = event.inputBuffer.getChannelData(0);
            const pcm16 = new Int16Array(input.length);
            for (let i = 0; i < input.length; i++) {
              const s = Math.max(-1, Math.min(1, input[i]));
              pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            const base64 = arrayBufferToBase64(pcm16.buffer);
            ws.send(
              JSON.stringify({
                user_audio_chunk: base64,
              }),
            );
          };

          source.connect(processor);
          processor.connect(audioContext.destination);
        };

        ws.onmessage = (event) => {
          if (typeof event.data === 'string') {
            handleServerMessage(event.data);
          }
        };

        ws.onerror = () => {
          addLog('error', 'Ошибка WebSocket-соединения');
        };

        ws.onclose = () => {
          addLog('warn', 'Соединение с ElevenLabs закрыто');
          setCallStatus((prev) => (prev === 'ending' ? 'idle' : 'idle'));
          cleanup();
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Неизвестная ошибка';
        addLog('error', `Не удалось начать звонок: ${message}`);
        setCallStatus('idle');
        cleanup();
      }
    },
    [addLog, cleanup, handleServerMessage, setCallStatus],
  );

  const endCall = useCallback(() => {
    setCallStatus('ending');
    addLog('info', 'Завершаем разговор...');
    cleanup();
    setCallStatus('idle');
    addLog('info', 'Разговор завершён');
  }, [addLog, cleanup, setCallStatus]);

  return { startCall, endCall };
}
