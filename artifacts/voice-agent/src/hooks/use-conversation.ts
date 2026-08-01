import { useCallback, useRef } from 'react';
import {
  AudioPlaybackQueue,
  arrayBufferToBase64,
  decodeBase64Pcm16,
} from '@/lib/audio-queue';
import type { AppState } from '@/hooks/use-app-state';

/** ElevenLabs expects 16 kHz PCM16 mono audio on the inbound stream. */
const ELEVENLABS_SAMPLE_RATE = 16000;

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
 * Linear-interpolation downsampler: float32 @ srcRate → Int16 @ 16 kHz.
 * Runs at the system's native AudioContext rate so getUserMedia never fails.
 */
function downsampleToInt16(input: Float32Array, srcRate: number): Int16Array {
  const ratio = srcRate / ELEVENLABS_SAMPLE_RATE;
  const outputLength = Math.round(input.length / ratio);
  const output = new Int16Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const srcIdx = i * ratio;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(lo + 1, input.length - 1);
    const frac = srcIdx - lo;
    const sample = input[lo] * (1 - frac) + input[hi] * frac;
    const clamped = Math.max(-1, Math.min(1, sample));
    output[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return output;
}

export function useConversation(appState: AppState) {
  const { addLog, setCallStatus, setMicLevel } = appState;

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  // One shared AudioContext for both capture and playback — this guarantees
  // the playback context is always running when the microphone graph is active.
  const audioCtxRef = useRef<AudioContext | null>(null);
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
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const s = (data[i] - 128) / 128;
          sum += s * s;
        }
        setMicLevel(Math.min(100, Math.round(Math.sqrt(sum / data.length) * 300)));
        levelRafRef.current = requestAnimationFrame(tick);
      };
      levelRafRef.current = requestAnimationFrame(tick);
    },
    [setMicLevel],
  );

  const cleanup = useCallback(() => {
    stopLevelMeter();

    try { processorRef.current?.disconnect(); } catch { /* noop */ }
    try { analyserRef.current?.disconnect(); } catch { /* noop */ }
    try { sourceRef.current?.disconnect(); } catch { /* noop */ }
    processorRef.current = null;
    analyserRef.current = null;
    sourceRef.current = null;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    playbackQueueRef.current?.clear();
    playbackQueueRef.current = null;

    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => undefined);
    }
    audioCtxRef.current = null;

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
      try { msg = JSON.parse(raw); } catch { return; }

      switch (msg.type) {
        case 'ping': {
          const eventId = msg.ping_event?.event_id;
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'pong', event_id: eventId }));
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
          if (!b64) break;

          const ctx = audioCtxRef.current;
          const queue = playbackQueueRef.current;

          if (!ctx || !queue) {
            addLog('warn', '⚠ Аудио от агента — контекст не готов');
            break;
          }

          addLog('info', `🔊 Аудио (${b64.length} байт) — ctx: ${ctx.state}`);

          try {
            if (ctx.state === 'suspended') {
              await ctx.resume();
              addLog('warn', `AudioContext возобновлён: ${ctx.state}`);
            }
            const buffer = await decodeBase64Pcm16(ctx, b64);
            addLog('info', `✓ ${buffer.length} сэмплов @ ${buffer.sampleRate} Гц`);
            queue.enqueue(buffer);
          } catch (err) {
            addLog('error', `Ошибка декодирования аудио: ${err instanceof Error ? err.message : String(err)}`);
          }
          break;
        }
        case 'interruption': {
          playbackQueueRef.current?.clear();
          addLog('warn', 'Агент прерван — очередь воспроизведения очищена');
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
            // The agent is played from this same page. Browser echo
            // cancellation can treat the user's voice as part of the
            // playback signal and remove it before ElevenLabs receives it.
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        mediaStreamRef.current = stream;
        addLog('info', 'Доступ к микрофону получен');

        setCallStatus('connecting');
        addLog('info', 'Устанавливаем соединение с ElevenLabs...');

        const AudioContextCtor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

        // Use the browser's native rate and downsample only the outgoing input.
        const audioCtx = new AudioContextCtor();
        audioCtxRef.current = audioCtx;
        addLog('info', `AudioContext: ${audioCtx.sampleRate} Гц, состояние: ${audioCtx.state}`);

        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
          addLog('info', `AudioContext возобновлён: ${audioCtx.state}`);
        }

        playbackQueueRef.current = new AudioPlaybackQueue(audioCtx, (errMsg) => {
          addLog('error', `Ошибка воспроизведения: ${errMsg}`);
        });

        const ws = new WebSocket(signedUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          // This client-data message is required before ElevenLabs starts
          // consuming user_audio_chunk messages. Without it, the agent can
          // still play its configured first message while ignoring the mic.
          ws.send(JSON.stringify({
            type: 'conversation_initiation_client_data',
            custom_llm_extra_body: {},
            conversation_config_override: {},
            dynamic_variables: {},
          }));
          addLog('info', 'Handshake ElevenLabs отправлен — включаем микрофонный поток');

          setCallStatus('active');
          addLog('info', 'Соединение установлено — разговор активен');

          const source = audioCtx.createMediaStreamSource(stream);
          sourceRef.current = source;

          // Analyser for VU meter (read-only tap, does not affect signal path)
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          analyserRef.current = analyser;
          source.connect(analyser);
          startLevelMeter(analyser);

          // This is the audio path from the last working version:
          // source → analyser → ScriptProcessor → silent sink.
          const processor = audioCtx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;
          const captureRate = audioCtx.sampleRate;
          let firstChunkLogged = false;
          let chunksSent = 0;

          processor.onaudioprocess = (event) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const input = event.inputBuffer.getChannelData(0);
            const pcm16 = downsampleToInt16(input, captureRate);

            if (!firstChunkLogged) {
              firstChunkLogged = true;
              let sumSquares = 0;
              let peak = 0;
              for (let i = 0; i < input.length; i++) {
                sumSquares += input[i] * input[i];
                peak = Math.max(peak, Math.abs(input[i]));
              }
              addLog(
                'info',
                `✓ Первый микрофонный чанк: RMS ${Math.sqrt(sumSquares / Math.max(1, input.length)).toFixed(5)}, пик ${peak.toFixed(5)}, ${pcm16.length} сэмплов @ 16 кГц`,
              );
            }

            ws.send(JSON.stringify({
              user_audio_chunk: arrayBufferToBase64(pcm16.buffer as ArrayBuffer),
            }));
            chunksSent++;
            if (chunksSent % 20 === 0) {
              addLog('info', `📤 Отправлено аудиочанков: ${chunksSent}`);
            }
          };

          // ScriptProcessorNode must be connected to an output to stay active.
          // The zero-gain sink prevents microphone audio from reaching speakers.
          analyser.connect(processor);
          const sink = audioCtx.createGain();
          sink.gain.value = 0;
          processor.connect(sink);
          sink.connect(audioCtx.destination);
          addLog('info', 'Аудиограф подключён — микрофонный поток отправляется');
        };

        ws.onmessage = (event) => {
          if (typeof event.data === 'string') handleServerMessage(event.data);
        };

        ws.onerror = () => {
          addLog('error', 'Ошибка WebSocket-соединения');
        };

        ws.onclose = (event) => {
          addLog(
            'warn',
            `Соединение с ElevenLabs закрыто (код ${event.code}, ${event.wasClean ? 'чисто' : 'аварийно'}${event.reason ? `: ${event.reason}` : ''})`,
          );
          setCallStatus('idle');
          cleanup();
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
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