---
name: Voice input compatibility
description: Durable constraint for the browser microphone path used by the ElevenLabs ConvAI websocket.
---

The current browser/ElevenLabs voice path is sensitive to the capture graph. The known working implementation uses the browser's native `AudioContext` rate, `ScriptProcessorNode` connected through a zero-gain sink, and downsamples only the outgoing PCM16 payload to 16 kHz. The WebSocket must send `conversation_initiation_client_data` immediately after opening, before `user_audio_chunk`; the client also handles `user_transcription_event` as `user_transcript`.

**Why:** The later AudioWorklet version produced outbound chunks but repeatedly yielded near-silent PCM and no user transcription, while the earlier ScriptProcessor version produced usable input and transcripts. A signed URL can still produce the agent's configured first message even when the client has not initialized the inbound audio protocol. ElevenLabs can also close an otherwise healthy session with WebSocket code 1002 when the account quota is exhausted.

**How to apply:** Preserve the native-rate capture graph unless a replacement is verified with a real call showing a non-zero first-chunk RMS and a `Клиент: ...` transcript. Treat `This request exceeds your quota limit` as an external account/billing limit, not an audio or server bug. Keep UI/logging changes separate from the audio-path change.