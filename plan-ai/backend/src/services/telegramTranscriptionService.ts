import { DeepgramClient } from "@deepgram/sdk";
import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";
import { getFileUrl } from "./telegramService";

const prisma = new PrismaClient();

/**
 * Voice-note transcription for the "Berry" Telegram intake.
 *
 * Separate from `projectTranscriptService`'s diarization path: that one splits
 * mic/system channels for meetings. A Telegram voice note is a single speaker
 * talking into a phone, so it needs neither diarization nor echo cancellation —
 * just text, fast.
 */

/**
 * Language passed to Deepgram. Defaults to "multi" (code-switching) which
 * covers ~10 languages but NOT Catalan — `multi` returns an EMPTY transcript
 * for Catalan rather than an error, so a Catalan-speaking prospect would
 * silently get nothing back. If BlueberryBytes targets Catalan clients, set
 * this to "ca" (nova-3 supports it monolingually). Same trap that cost us
 * meetings in the recorder; see `projectTranscriptService.resolveDiarization`.
 */
const LANGUAGE = process.env.TELEGRAM_TRANSCRIPTION_LANGUAGE || "multi";

/** Telegram caps bot downloads at 20MB; a voice note is far below that. */
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;

const resolveDeepgramKey = async (workspaceId: string): Promise<string | null> => {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { deepgramKey: true },
  });
  // BYOK first (the sales workspace pays for its own leads), env as fallback so
  // a misconfigured workspace degrades instead of going dark.
  return workspace?.deepgramKey || process.env.DEEPGRAM_API_KEY || null;
};

/**
 * Downloads the voice note and transcribes it.
 *
 * The file is fetched into memory and handed to Deepgram as a buffer rather
 * than passing the download URL: that URL embeds the bot token, and handing it
 * to a third party would leak credentials that grant full control of the bot.
 *
 * Returns null when transcription is impossible, and "" when Deepgram succeeded
 * but heard nothing — callers should tell the prospect rather than fail silently.
 */
export const transcribeVoiceNote = async (
  fileId: string,
  workspaceId: string,
): Promise<string | null> => {
  const key = await resolveDeepgramKey(workspaceId);
  if (!key) {
    logger.error(`[telegram] no Deepgram key available for workspace ${workspaceId}`);
    return null;
  }

  const url = await getFileUrl(fileId);
  if (!url) {
    logger.warn(`[telegram] could not resolve file URL for ${fileId}`);
    return null;
  }

  let audio: Buffer;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!response.ok) {
      // Never log `url` — it contains the bot token.
      logger.warn(`[telegram] voice download failed (${response.status}) for file ${fileId}`);
      return null;
    }
    audio = Buffer.from(await response.arrayBuffer());
  } catch (err) {
    logger.warn(`[telegram] voice download threw for file ${fileId}`, err);
    return null;
  }

  if (audio.length > MAX_AUDIO_BYTES) {
    logger.warn(`[telegram] voice note ${fileId} too large (${audio.length}B)`);
    return null;
  }

  const deepgram = new DeepgramClient({ key });

  const attempt = async (language: string): Promise<string | null> => {
    const result = await deepgram.listen.prerecorded.transcribeFile(audio, {
      model: "nova-3",
      smart_format: true,
      language,
      filler_words: false,
    });

    if (result.error) {
      logger.warn(`[telegram] Deepgram error (lang=${language}): ${result.error.message}`);
      return null;
    }

    return result.result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
  };

  try {
    const transcript = await attempt(LANGUAGE);
    // Self-healing retry, mirroring the recorder: a monolingual code that fails
    // is worth one retry on "multi" — a degraded transcript beats no lead.
    if (transcript === null && LANGUAGE !== "multi") {
      logger.warn(`[telegram] retrying transcription with language=multi`);
      return await attempt("multi");
    }
    return transcript;
  } catch (err) {
    logger.error(`[telegram] transcription threw for file ${fileId}`, err);
    return null;
  }
};
