import { getWhisperDiarizeConfig, type WhisperDiarizeConfig } from "./sttConfig";
import type { ChannelUtterance } from "./whisperPrerecorded";
import { withLongRequestDispatcher } from "./longRequest";

/**
 * Gives each Whisper utterance of the system-audio channel a speaker, through
 * the voice service's /diarize endpoint (ECAPA voice embeddings plus
 * clustering, see plan-ai/voice-ai/diarization.py).
 *
 * Never throws. If the service is off, unreachable or fails, the utterances
 * come back unchanged (everyone as speaker 0) with the reason in `error`, so
 * the transcript still gets saved and the failure lands in its diagnostics.
 */

export interface DiarizedChannel {
  utterances: ChannelUtterance[];
  speakerCount: number;
  error?: string;
}

export const diarizeUtterances = async (
  audio: Buffer,
  file: { filename: string; mimeType: string },
  utterances: ChannelUtterance[],
  config: WhisperDiarizeConfig = getWhisperDiarizeConfig(),
): Promise<DiarizedChannel> => {
  const unchanged = (error?: string): DiarizedChannel => ({
    utterances,
    speakerCount: utterances.length > 0 ? 1 : 0,
    error,
  });
  if (!config.enabled) return unchanged();
  if (utterances.length < 2) return unchanged();

  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(audio)], { type: file.mimeType }), file.filename);
  form.append("segments", JSON.stringify(utterances.map((u) => ({ start: u.start, end: u.end }))));
  form.append("max_speakers", String(config.maxSpeakers));
  form.append("threshold", String(config.threshold));

  let labels: unknown;
  try {
    const res = await fetch(
      `${config.voiceAiUrl}/diarize`,
      withLongRequestDispatcher({
        method: "POST",
        body: form,
        headers: config.apiKey ? { "x-api-key": config.apiKey } : undefined,
        signal: AbortSignal.timeout(config.timeoutMs),
      }),
    );
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      return unchanged(
        `speaker separation failed: voice service returned HTTP ${res.status} ${detail}`,
      );
    }
    labels = ((await res.json()) as { labels?: unknown }).labels;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return unchanged(`speaker separation failed: voice service unreachable (${reason})`);
  }

  if (
    !Array.isArray(labels) ||
    labels.length !== utterances.length ||
    !labels.every((l) => Number.isInteger(l) && l >= 0)
  ) {
    return unchanged("speaker separation failed: voice service returned malformed labels");
  }

  const speakers = labels as number[];
  return {
    utterances: utterances.map((u, i) => ({
      ...u,
      speaker: speakers[i],
      words: u.words.map((w) => ({ ...w, speaker: speakers[i] })),
    })),
    speakerCount: new Set(speakers).size,
  };
};
