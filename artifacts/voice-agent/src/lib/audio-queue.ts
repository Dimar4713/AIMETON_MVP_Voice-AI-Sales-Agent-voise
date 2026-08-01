/**
 * Sequential AudioBuffer playback queue built on the Web Audio API.
 * ElevenLabs streams PCM audio chunks over the WebSocket; this queue
 * decodes and plays them back-to-back with no overlap, and can be
 * flushed instantly on interruption.
 */
export class AudioPlaybackQueue {
  private ctx: AudioContext;
  private queue: AudioBuffer[] = [];
  private isPlaying = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private onError?: (msg: string) => void;
  private onPlay?: (buffer: AudioBuffer) => void;
  private outputGain: GainNode;

  constructor(
    ctx: AudioContext,
    onError?: (msg: string) => void,
    onPlay?: (buffer: AudioBuffer) => void,
  ) {
    this.ctx = ctx;
    this.onError = onError;
    this.onPlay = onPlay;
    this.outputGain = ctx.createGain();
    this.outputGain.gain.value = 1;
    this.outputGain.connect(ctx.destination);
  }

  enqueue(buffer: AudioBuffer) {
    this.queue.push(buffer);
    if (!this.isPlaying) {
      this.playNext();
    }
  }

  private playNext() {
    const next = this.queue.shift();
    if (!next) {
      this.isPlaying = false;
      this.currentSource = null;
      return;
    }
    this.isPlaying = true;

    // If the context got suspended between chunks, resume it now
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => this.playBuffer(next)).catch((e) => {
        this.onError?.(`resume failed: ${e}`);
        this.isPlaying = false;
      });
      return;
    }

    this.playBuffer(next);
  }

  private playBuffer(buffer: AudioBuffer) {
    try {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.outputGain);
      source.onended = () => {
        if (this.currentSource === source) {
          this.currentSource = null;
        }
        this.playNext();
      };
      this.currentSource = source;
      this.onPlay?.(buffer);
      source.start();
    } catch (e) {
      this.onError?.(`playBuffer error: ${e}`);
      this.isPlaying = false;
      // Try next chunk anyway
      this.playNext();
    }
  }

  /** Stop any current playback and drop all queued chunks (interruption). */
  clear() {
    this.queue = [];
    if (this.currentSource) {
      try {
        this.currentSource.onended = null;
        this.currentSource.stop();
      } catch {
        // already stopped
      }
      this.currentSource = null;
    }
    this.isPlaying = false;
  }

  dispose() {
    this.clear();
    try {
      this.outputGain.disconnect();
    } catch {
      // Already disconnected.
    }
  }
}

/** Decode a base64 PCM16 mono chunk (16kHz) into an AudioBuffer. */
export async function decodeBase64Pcm16(
  ctx: AudioContext,
  base64: string,
  sampleRate = 16000,
): Promise<AudioBuffer> {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(len / 2);
  const audioBuffer = ctx.createBuffer(1, sampleCount, sampleRate);
  const channel = audioBuffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) {
    const int16 = view.getInt16(i * 2, true);
    channel[i] = int16 / 32768;
  }
  return audioBuffer;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
