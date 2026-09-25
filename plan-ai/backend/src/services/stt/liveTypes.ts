import type { createClient } from "@deepgram/sdk";

/**
 * The live-transcription config the audio stream builds. It's Deepgram's
 * schema because Deepgram was first; the Whisper connection reads the subset
 * that means something to it (language, sample rate, endpointing, keyterms).
 */
export type LiveTranscriptionConfig = NonNullable<
  Parameters<ReturnType<typeof createClient>["listen"]["live"]>[0]
>;

/**
 * What `routes/audioStream.ts` needs from a live connection. Deepgram's
 * `ListenLiveClient` satisfies it as is, and `WhisperLiveConnection` implements
 * it, emitting the same event names (`LiveTranscriptionEvents`) with the same
 * payload shape.
 */
export interface LiveTranscriptionConnection {
  send(data: ArrayBufferLike): void;
  requestClose(): void;
  keepAlive(): void;
  /** WebSocket-style: 0 connecting, 1 open, 2 closing, 3 closed. */
  getReadyState(): number;
  // Same listener type as Node's EventEmitter. Each event has its own payload
  // and callers pass listeners typed for one event; with strictFunctionTypes a
  // `(...args: unknown[]) => void` parameter rejects every one of them (tried),
  // so this is the one place `any` is the honest type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): unknown;
  removeAllListeners(event?: string): unknown;
}
