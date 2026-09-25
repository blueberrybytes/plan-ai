import { logger } from "../../utils/logger";

/**
 * Which speech-to-text engine the backend uses.
 *
 * It's a backend-wide setting on purpose. Choosing it means choosing where
 * meeting audio is allowed to go, which is a decision about the deployment,
 * not about a user or a workspace.
 *
 *   STT_PROVIDER=deepgram  Deepgram's cloud (default). Needs a key: the
 *                          workspace's BYOK key, or the platform key.
 *   STT_PROVIDER=whisper   A self-hosted Whisper server with an
 *                          OpenAI-compatible API (speaches in
 *                          docker-compose.yml). Audio never leaves the host.
 */
export type SttProvider = "deepgram" | "whisper";

export interface WhisperConfig {
  /** Server base URL, without the /v1 suffix. */
  baseUrl: string;
  /** Bearer key, only for a server started with API_KEY set. */
  apiKey?: string;
  /** Model for the post-meeting pass and voice notes, where accuracy matters most. */
  model: string;
  /** Model for live captions. A smaller one keeps up better on a CPU-only host. */
  liveModel: string;
  /**
   * How often the live pass re-transcribes the sentence still being spoken,
   * to show interim captions. 0 turns interims off, and captions then appear
   * once per sentence.
   */
  liveInterimMs: number;
  /**
   * Timeout for one post-meeting request. A long channel on CPU takes minutes
   * (measured: large-v3-turbo in int8 with 8 threads does 24 s of audio in
   * 6.3 s, about 4x faster than real time), so this is generous.
   */
  batchTimeoutMs: number;
}

export const DEFAULT_WHISPER_MODEL = "deepdml/faster-whisper-large-v3-turbo-ct2";
const DEFAULT_WHISPER_URL = "http://localhost:8010";
const DEFAULT_INTERIM_MS = 1500;
const DEFAULT_BATCH_TIMEOUT_MS = 60 * 60 * 1000;

let warnedAboutProvider = false;

export const getSttProvider = (): SttProvider => {
  const raw = (process.env.STT_PROVIDER ?? "").trim().toLowerCase();
  if (raw === "whisper") return "whisper";
  if (raw && raw !== "deepgram" && !warnedAboutProvider) {
    // A typo here must not take transcription down. Falling back to the
    // default keeps recordings working, and the warning says why.
    warnedAboutProvider = true;
    logger.warn(`[STT] Unknown STT_PROVIDER="${raw}", using deepgram`);
  }
  return "deepgram";
};

const readNumber = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const getWhisperConfig = (): WhisperConfig => {
  const model = process.env.WHISPER_MODEL?.trim() || DEFAULT_WHISPER_MODEL;
  return {
    baseUrl: (process.env.WHISPER_BASE_URL?.trim() || DEFAULT_WHISPER_URL).replace(/\/+$/, ""),
    apiKey: process.env.WHISPER_API_KEY?.trim() || undefined,
    model,
    liveModel: process.env.WHISPER_LIVE_MODEL?.trim() || model,
    liveInterimMs: readNumber("WHISPER_LIVE_INTERIM_MS", DEFAULT_INTERIM_MS),
    batchTimeoutMs: readNumber("WHISPER_TIMEOUT_MS", DEFAULT_BATCH_TIMEOUT_MS),
  };
};
