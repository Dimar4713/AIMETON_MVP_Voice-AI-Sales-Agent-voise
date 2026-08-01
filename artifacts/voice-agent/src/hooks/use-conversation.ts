import { useCallback, useRef } from 'react';
import {
  AudioPlaybackQueue,
  arrayBufferToBase64,
  decodeBase64Pcm16,
} from '@/lib/audio-queue';
import type { AppState } from '@/hooks/use-app-state';

/** ElevenLabs expects 16 kHz PCM16 mono audio on the inbound stream. */
const ELEVENLABS_SAMPLE_RATE = 16000;

/**
 * Target chunk duration sent to ElevenLabs, in milliseconds.
 * The actual sample count threshold is derived from the context's sample rate
 * so chunks are consistently ~100 ms regardless of AudioContext rate.
 */
const CHUNK_DURATION_MS = 100;

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
 * Linear-interpolation downsampler: Float32 @ srcRate → Int16 @ 16 kHz.
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
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playbackQueueRef = useRef<AudioPlaybackQueue | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const keepAliveRef = useRef<ConstantSourceNode | null>(null);
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

    // Stop keep-alive source
    try { keepAliveRef.current?.stop(); } catch { /* already stopped */ }
    try { keepAliveRef.current?.disconnect(); } catch { /* noop */ }
    keepAliveRef.current = null;

    try { workletNodeRef.current?.disconnect(); } catch { /* noop */ }
    workletNodeRef.current = null;

    try { analyserRef.current?.disconnect(); } catch { /* noop */ }
    analyserRef.current = null;

    try { sourceRef.current?.disconnect(); } catch { /* noop */ }
    sourceRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;

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
          if (!ctx || !queue) break;
          try {
            if (ctx.state === 'suspended') await ctx.resume();
            const buffer = await decodeBase64Pcm16(ctx, b64);
            queue.enqueue(buffer);
          } catch (err) {
            addLog('error', `Ошибка воспроизведения: ${err instanceof Error ? err.message : String(err)}`);
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
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

        // Force 48 kHz — the universally supported standard rate.
        // Without this, Chrome may create a 16 kHz context on hardware that
        // reports 16 kHz as native, causing poor resampling of mic audio.
        const audioCtx = new AudioContextCtor({ sampleRate: 48000 });
        audioCtxRef.current = audioCtx;
        const captureRate = audioCtx.sampleRate;

        if (audioCtx.state === 'suspended') await audioCtx.resume();

        addLog('info', `AudioContext: ${captureRate} Гц, состояние: ${audioCtx.state}`);

        // ── Keep-alive: ConstantSourceNode through a muted gain ──────────────
        // Ensures the AudioContext is never auto-suspended during pauses.
        // The signal is below the hearing threshold and muted at the gain stage.
        const keepAlive = audioCtx.createConstantSource();
        keepAlive.offset.value = 0.001;
        const keepAliveGain = audioCtx.createGain();
        keepAliveGain.gain.value = 0;
        keepAlive.connect(keepAliveGain);
        keepAliveGain.connect(audioCtx.destination);
        keepAlive.start();
        keepAliveRef.current = keepAlive;

        // ── Playback queue ────────────────────────────────────────────────────
        playbackQueueRef.current = new AudioPlaybackQueue(audioCtx, (errMsg) => {
          addLog('error', `Ошибка воспроизведения: ${errMsg}`);
        });

        // ── Load AudioWorklet module ──────────────────────────────────────────
        // BASE_URL includes trailing slash, e.g. "/" or "/voice-agent/"
        const workletUrl = `${import.meta.env.BASE_URL}worklets/mic-processor.js`;
        addLog('info', `Загружаем AudioWorklet: ${workletUrl}`);
        await audioCtx.audioWorklet.addModule(workletUrl);
        addLog('info', 'AudioWorklet загружен');

        const ws = new WebSocket(signedUrl);
        wsRef.current = ws;

        ws.onopen = async () => {
          setCallStatus('active');
          addLog('info', 'Соединение установлено — разговор активен');

          const source = audioCtx.createMediaStreamSource(stream);
          sourceRef.current = source;

          // Analyser for VU meter (read-only tap)
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          analyserRef.current = analyser;
          source.connect(analyser);
          startLevelMeter(analyser);

          // AudioWorkletNode — runs on the audio thread, immune to main-thread
          // congestion and AudioContext auto-suspension
          const workletNode = new AudioWorkletNode(audioCtx, 'mic-processor');
          workletNodeRef.current = workletNode;

          // Accumulation buffer: collect native-rate chunks, then batch-send.
          // Threshold is time-based so chunk duration stays ~100 ms regardless
          // of AudioContext rate (e.g. 48 kHz → 4800 samples, 44.1 kHz → 4410).
          const sendThreshold = Math.floor(captureRate * CHUNK_DURATION_MS / 1000);
          let accumBuf: Float32Array[] = [];
          let accumSize = 0;

          workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const chunk = event.data;
            accumBuf.push(chunk);
            accumSize += chunk.length;

            if (accumSize >= sendThreshold) {
              // Merge accumulated chunks into one contiguous buffer
              const merged = new Float32Array(accumSize);
              let offset = 0;
              for (const c of accumBuf) { merged.set(c, offset); offset += c.length; }
              accumBuf = [];
              accumSize = 0;

              const pcm16 = downsampleToInt16(merged, captureRate);
              ws.send(JSON.stringify({
                user_audio_chunk: arrayBufferToBase64(pcm16.buffer as ArrayBuffer),
              }));
            }
          };

          // source → analyser → workletNode (processes audio; output discarded)
          analyser.connect(workletNode);
          // Connect output to a silent sink so Chrome treats the graph as active
          const sink = audioCtx.createGain();
          sink.gain.value = 0;
          workletNode.connect(sink);
          sink.connect(audioCtx.destination);
        };

        ws.onmessage = (event) => {
          if (typeof event.data === 'string') handleServerMessage(event.data);
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
