import {
  buildPrompt,
  isNoiseSegment,
  toDeepgramWord,
  transcribeWithWhisper,
  type WhisperTranscription,
  type WhisperWord,
} from "./whisperClient";
import { getWhisperConfig, type WhisperConfig, type WhisperDiarizeConfig } from "./sttConfig";
import { diarizeUtterances } from "./whisperDiarization";
import { transcodeToWav16kMono } from "../../utils/audioPcm";
import { logger } from "../../utils/logger";

/**
 * Post-meeting transcription of one recorded channel with Whisper.
 *
 * Returns utterances in the same shape the Deepgram pass produces, so
 * everything downstream (echo dedup, speaker identification, speaker
 * insights) works unchanged.
 *
 * Whisper doesn't separate speakers, so every utterance of a channel gets
 * speaker 0. The channels already tell the user ("User 0", the mic) apart
 * from everyone else ("Others 0", the system audio). What's lost is telling
 * the remote participants apart from each other. That needs a diarization
 * model (pyannote) on top, which is the next step for this provider.
 */

export type AudioSource = { url: string } | { buffer: Buffer };

export interface ChannelWord {
  word: string;
  punctuated_word: string;
  start: number;
  end: number;
  confidence: number;
  speaker: number;
}

export interface ChannelUtterance {
  speaker: number;
  transcript: string;
  start: number;
  end: number;
  words: ChannelWord[];
}

export interface ChannelTranscription {
  utterances: ChannelUtterance[];
  detectedLanguage?: string;
  durationSeconds?: number;
  /** Distinct speakers after separation; 1 when the channel wasn't separated. */
  speakerCount?: number;
  /** Why speaker separation didn't happen, when it was asked for and failed. */
  diarizationError?: string;
}

/** Same pause Deepgram splits utterances on in the recorder pass (`utt_split: 0.5`). */
const UTTERANCE_SPLIT_SECONDS = 0.5;
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

const EXTENSION_BY_TYPE: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "video/webm": "webm",
  "video/mp4": "mp4",
};

const fileNameFor = (url: string, contentType: string | null): string => {
  const fromPath = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1];
  const fromType = contentType ? EXTENSION_BY_TYPE[contentType.split(";")[0].trim()] : undefined;
  return `audio.${(fromPath ?? fromType ?? "webm").toLowerCase()}`;
};

/**
 * Stored recordings are referenced by URL. Deepgram fetches URLs itself, but a
 * self-hosted Whisper server takes the file, so the backend downloads it first.
 */
const loadAudio = async (
  source: AudioSource,
): Promise<{ audio: Buffer; filename: string; mimeType: string }> => {
  if ("buffer" in source) {
    // The only buffer source today is the echo-cancelled mic, encoded as WAV.
    return { audio: source.buffer, filename: "audio.wav", mimeType: "audio/wav" };
  }
  const res = await fetch(source.url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Could not download the recording (HTTP ${res.status})`);
  const contentType = res.headers.get("content-type");
  const original = Buffer.from(await res.arrayBuffer());
  try {
    // See transcodeToWav16kMono: the recorder's WebM, sent as is, loses words.
    return {
      audio: await transcodeToWav16kMono(original),
      filename: "audio.wav",
      mimeType: "audio/wav",
    };
  } catch (err) {
    // Without ffmpeg the original still transcribes, only worse. Better than
    // failing the channel, and the warning says what to fix.
    logger.warn(
      `[Whisper] Couldn't convert the recording to WAV, sending it as is: ${err instanceof Error ? err.message : err}`,
    );
    return {
      audio: original,
      filename: fileNameFor(source.url, contentType),
      mimeType: contentType?.split(";")[0].trim() || "application/octet-stream",
    };
  }
};

const toUtterance = (words: WhisperWord[]): ChannelUtterance => {
  const mapped = words.map((w) => ({ ...toDeepgramWord(w), speaker: 0 }));
  return {
    speaker: 0,
    // Whisper's raw words carry their own leading space, and pieces of one
    // word carry none ("l" + "'informe"). Joining the raw text keeps
    // "l'informe" whole; joining trimmed words with spaces would split it.
    transcript: words
      .map((w) => w.word)
      .join("")
      .replace(/\s+/g, " ")
      .trim(),
    start: mapped[0].start,
    end: mapped[mapped.length - 1].end,
    words: mapped,
  };
};

/** Split Whisper segments into Deepgram-sized utterances on pauses. */
export const toChannelUtterances = (
  t: WhisperTranscription,
  keyterms?: string[],
): ChannelUtterance[] => {
  const prompt = buildPrompt(keyterms);
  const out: ChannelUtterance[] = [];
  for (const segment of t.segments) {
    if (isNoiseSegment(segment, prompt)) continue;

    const words = segment.words?.length
      ? segment.words
      : t.words.filter((w) => w.start >= segment.start && w.end <= segment.end);

    if (words.length === 0) {
      // No word timings: keep the segment whole rather than lose the text.
      if (segment.text) {
        out.push({
          speaker: 0,
          transcript: segment.text,
          start: segment.start,
          end: segment.end,
          words: [],
        });
      }
      continue;
    }

    let run: WhisperWord[] = [words[0]];
    for (let i = 1; i < words.length; i++) {
      if (words[i].start - words[i - 1].end >= UTTERANCE_SPLIT_SECONDS) {
        out.push(toUtterance(run));
        run = [];
      }
      run.push(words[i]);
    }
    out.push(toUtterance(run));
  }
  return out.filter((u) => u.transcript.length > 0);
};

export const transcribeChannelWithWhisper = async (
  source: AudioSource,
  language: string,
  options: {
    keyterms?: string[];
    config?: WhisperConfig;
    /**
     * Separate speakers within the channel. Only the system-audio channel
     * needs it: the mic is always the user.
     */
    diarize?: boolean;
    diarizeConfig?: WhisperDiarizeConfig;
  } = {},
): Promise<ChannelTranscription> => {
  const config = options.config ?? getWhisperConfig();
  const { audio, filename, mimeType } = await loadAudio(source);
  const result = await transcribeWithWhisper(
    audio,
    { model: config.model, language, keyterms: options.keyterms, filename, mimeType },
    config,
  );
  const utterances = toChannelUtterances(result, options.keyterms);
  const base = {
    detectedLanguage: result.language,
    durationSeconds: result.duration,
  };
  if (!options.diarize) {
    return { ...base, utterances, speakerCount: utterances.length > 0 ? 1 : 0 };
  }
  // Same bytes Whisper just got: the voice service doesn't download again.
  const diarized = await diarizeUtterances(
    audio,
    { filename, mimeType },
    utterances,
    options.diarizeConfig,
  );
  return {
    ...base,
    utterances: diarized.utterances,
    speakerCount: diarized.speakerCount,
    diarizationError: diarized.error,
  };
};
