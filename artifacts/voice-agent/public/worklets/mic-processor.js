/**
 * AudioWorklet processor — microphone capture for ElevenLabs ConvAI.
 *
 * Runs on the dedicated audio-render thread (never blocked by the main thread).
 * Sends raw Float32 PCM frames to the main thread via MessagePort for
 * accumulation, downsampling, and forwarding to the WebSocket.
 *
 * Returning `true` from process() marks this node as "active", which prevents
 * Chrome from auto-suspending the AudioContext during conversation pauses.
 */
class MicProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel && channel.length > 0) {
      // Copy into a new buffer, then transfer ownership (zero-copy to main thread)
      const copy = new Float32Array(channel.length);
      copy.set(channel);
      this.port.postMessage(copy, [copy.buffer]);
    }
    // return true → keep node alive → prevents AudioContext auto-suspension
    return true;
  }
}

registerProcessor('mic-processor', MicProcessor);
