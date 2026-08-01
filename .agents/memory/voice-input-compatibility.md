---
name: Voice input compatibility
description: Durable constraint for the browser microphone path used by the ElevenLabs ConvAI websocket.
---

The current browser/ElevenLabs voice path is sensitive to the capture graph. The known working implementation uses the browser's native `AudioContext` rate, `ScriptProcessorNode` connected through a zero-gain sink, and downsamples only the outgoing PCM16 payload to 16 kHz. It also handles `user_transcription_event` as `user_transcript`.

**Why:** The later AudioWorklet version produced outbound chunks but repeatedly yielded near-silent PCM and no user transcription, while the earlier ScriptProcessor version produced usable input and transcripts.

**How to apply:** Preserve the native-rate capture graph unless a replacement is verified with a real call showing a non-zero first-chunk RMS and a `Клиент: ...` transcript. Keep UI/logging changes separate from the audio-path change.