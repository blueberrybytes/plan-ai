import { createClient } from "@deepgram/sdk";
import { getWhisperConfig, type SttProvider, type WhisperConfig } from "./sttConfig";
import type { LiveTranscriptionConfig, LiveTranscriptionConnection } from "./liveTypes";
import { WhisperLiveConnection, type WhisperLiveOptions } from "./whisperLiveConnection";

/**
 * Opens live transcription connections for the recorder's audio stream. One
 * transcriber per recording session; `live()` is called once per channel,
 * again on a language change, and again on every reconnect.
 */
export interface LiveTranscriber {
  readonly provider: SttProvider;
  /** `provider` and `model` as recorded in AiUsageLog. */
  readonly usage: { provider: string; model: string };
  live(config: LiveTranscriptionConfig): LiveTranscriptionConnection;
}

export const createDeepgramLiveTranscriber = (apiKey: string): LiveTranscriber => {
  const deepgram = createClient(apiKey);
  return {
    provider: "deepgram",
    usage: { provider: "DEEPGRAM", model: "nova-3-live" },
    live: (config) => deepgram.listen.live(config),
  };
};

const toKeyterms = (keyterm: LiveTranscriptionConfig["keyterm"]): string[] | undefined => {
  if (!keyterm) return undefined;
  return Array.isArray(keyterm) ? keyterm : [keyterm];
};

/** Reads the part of Deepgram's live config that means something to Whisper. */
export const whisperLiveOptionsFrom = (
  config: LiveTranscriptionConfig,
  whisper: WhisperConfig,
): WhisperLiveOptions => ({
  whisper,
  model: whisper.liveModel,
  language: config.language,
  sampleRate: config.sample_rate ?? 24000,
  endpointingMs: typeof config.endpointing === "number" ? config.endpointing : 500,
  utteranceEndMs: config.utterance_end_ms ?? 1000,
  interimMs: config.interim_results === false ? 0 : whisper.liveInterimMs,
  keyterms: toKeyterms(config.keyterm),
});

export const createWhisperLiveTranscriber = (
  whisper: WhisperConfig = getWhisperConfig(),
): LiveTranscriber => ({
  provider: "whisper",
  usage: { provider: "WHISPER", model: whisper.liveModel },
  live: (config) => new WhisperLiveConnection(whisperLiveOptionsFrom(config, whisper)),
});
