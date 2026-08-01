import { useCallback, useRef } from 'react';
import {
  AudioPlaybackQueue,
  arrayBufferToBase64,
  decodeBase64Pcm16,
} from '@/lib/audio-queue';
import type { AppState } from '@/hooks/use-app-state';

const ELEVENLABS_SAMPLE_RATE = 16000; // ElevenLabs expects 16 kHz PCM16 mono

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
 *
 * IMPORTANT: ElevenLabs expects 16 kHz PCM16 mono audio.
 * We create the capture AudioContext at exactly 16000 Hz so that no
 * resampling is needed — sending at the system rate (44100 / 48000 Hz)
 * causes the agent to hear garbled high-pitched audio and not understand
 * the user.
 */
export function useConversation(appState: AppState) {
  const { addLog, setCallStatus, setMicLevel } = appState;

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const playbackQueueRef = useRef<AudioPlaybackQueue | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelRafRef = useRef<number | null>(null);

  const stopLevelMeter = useCallback(() => {
    if (levelRafRef.current !== null) {
      cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
    }
    setMicLevel(0);
  }, [setMicLevel]);

  const startLevelMeter = useCallback(
    (analyser: AnalyserNode) => {
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        // RMS of the time-domain samples, mapped to 0-100
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const s = (data[i] - 128) / 128;
          sum += s * s;
        }
        const rms = Math.sqrt(sum / data.length);
        setMicLevel(Math.min(100, Math.round(rms * 300)));
        levelRafRef.current = requestAnimationFrame(tick);
      };
      levelRafRef.current = requestAnimationFrame(tick);
    },
    [setMicLevel],
  );

  const cleanup = useCallback(() => {
    stopLevelMeter();

    try {
      processorRef.current?.disconnect();
    } catch {
      /* noop */
    }
    try {
      analyserRef.current?.disconnect();
    } catch {
      /* noop */
    }
    try {
      sourceRef.current?.disconnect();
    } catch {
      /* noop */
    }
    processorRef.current = null;
    analyserRef.current = null;
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
  }, [stopLevelMeter]);

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
          const text =
            msg.agent_response_correction_event?.corrected_agent_response;
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
            } catch {
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
            sampleRate: ELEVENLABS_SAMPLE_RATE,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
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

        // CRITICAL: create the capture context at exactly 16000 Hz.
        // If the context runs at the system default (44100/48000 Hz), the
        // ScriptProcessor produces samples at that rate and ElevenLabs receives
        // audio that is 2.75–3× too fast / high-pitched and cannot transcribe it.
        const audioContext = new AudioContextCtor({
          sampleRate: ELEVENLABS_SAMPLE_RATE,
        });
        audioContextRef.current = audioContext;

        // Playback context can run at any rate; we decode PCM16 at 16 kHz
        // inside decodeBase64Pcm16 and the browser resamples on playback.
        const playbackCtx = new AudioContextCtor();
        playbackCtxRef.current = playbackCtx;
        playbackQueueRef.current = new AudioPlaybackQueue(playbackCtx);

        const ws = new WebSocket(signedUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setCallStatus('active');
          addLog(
            'info',
            `Соединение установлено — разговор активен (${ELEVENLABS_SAMPLE_RATE} Гц, PCM16)`,
          );

          const source = audioContext.createMediaStreamSource(stream);
          sourceRef.current = source;

          // Analyser for the live mic-level meter (does not affect the signal)
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 256;
          analyserRef.current = analyser;
          source.connect(analyser);
          startLevelMeter(analyser);

          // ScriptProcessor: forward PCM16 chunks to ElevenLabs
          const processor = audioContext.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          processor.onaudioprocess = (event) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const input = event.inputBuffer.getChannelData(0);
            // Convert float32 samples [-1, 1] → Int16
            const pcm16 = new Int16Array(input.length);
            for (let i = 0; i < input.length; i++) {
              const s = Math.max(-1, Math.min(1, input[i]));
              pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
            }
            const base64 = arrayBufferToBase64(pcm16.buffer);
            ws.send(JSON.stringify({ user_audio_chunk: base64 }));
          };

          analyser.connect(processor);
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
          setCallStatus('idle');
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
    [addLog, cleanup, handleServerMessage, setCallStatus, startLevelMeter],
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
