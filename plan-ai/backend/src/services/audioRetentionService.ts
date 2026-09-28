import { Prisma, type Transcript } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import { deleteStoredObject } from "../firebase/privateStorage";
import { logger } from "../utils/logger";

/**
 * Deleting meeting audio while keeping everything made from it: transcript,
 * speakers, summary, tasks, documents. Used by the workspace retention rule
 * (daily job) and by the "delete audio" action on a single meeting.
 *
 * A reprocess after this works from the saved text, since the audio is gone.
 */

/**
 * Still being transcribed or analysed. The pipeline reads the audio and
 * writes the metadata it read at the start, which would undo the deletion.
 */
const PAGE_SIZE = 200;
// A bound on one day's work per workspace. Whatever is left goes tomorrow.
const MAX_ROWS_PER_WORKSPACE = 5000;

export const BUSY_STATUSES = new Set([
  "PENDING",
  "PROCESSING",
  "EXTRACTING_TASKS",
  "REFINING_TASKS",
]);

/** The meeting started processing again: its audio is being read. */
export class AudioInUseError extends Error {
  constructor() {
    super("The meeting is being processed. Try again when it finishes.");
  }
}

// Written as the transcript while the audio waits for its transcription.
const TRANSCRIPT_PLACEHOLDER = "Processing...";

/**
 * True when the meeting has no text of its own yet: a phone recording or an
 * imported file whose transcription never finished. Its audio is then the
 * only copy of the meeting, and deleting it loses the meeting.
 */
export function audioIsOnlyCopy(
  transcript: Pick<Transcript, "transcript" | "utterances">,
): boolean {
  if (Array.isArray(transcript.utterances) && transcript.utterances.length > 0) return false;
  const text = transcript.transcript?.trim() ?? "";
  return text === "" || text === TRANSCRIPT_PLACEHOLDER;
}

export async function deleteTranscriptAudio(
  transcript: Pick<Transcript, "id" | "rawMicUrl" | "rawSysUrl" | "metadata">,
  reason: "retention" | "user",
): Promise<boolean> {
  const refs = [transcript.rawMicUrl, transcript.rawSysUrl].filter((r): r is string => !!r);
  if (refs.length === 0) return false;
  // Read the status again right before deleting. The caller's copy can be
  // minutes old (the retention job walks hundreds of rows), and a reprocess
  // started since then is reading this audio now.
  const before = await prisma.transcript.findUnique({
    where: { id: transcript.id },
    select: { metadata: true },
  });
  if (!before) return false;
  const status = (before.metadata as Prisma.JsonObject | null)?.processingStatus;
  if (typeof status === "string" && BUSY_STATUSES.has(status)) {
    throw new AudioInUseError();
  }
  for (const ref of refs) {
    await deleteStoredObject(ref);
  }
  // Read again: a status change during the deletion must not be undone.
  const fresh = await prisma.transcript.findUnique({
    where: { id: transcript.id },
    select: { metadata: true },
  });
  const metadata = ((fresh ?? before).metadata as Prisma.JsonObject | null) ?? {};
  await prisma.transcript.update({
    where: { id: transcript.id },
    data: {
      rawMicUrl: null,
      rawSysUrl: null,
      metadata: {
        ...metadata,
        audioDeletedAt: new Date().toISOString(),
        audioDeletedReason: reason,
      } as Prisma.InputJsonValue,
    },
  });
  return true;
}

/**
 * Applies every workspace's retention rule: audio of meetings recorded more
 * than `audioRetentionDays` ago is deleted. Returns how many meetings lost
 * their audio. Meetings still being processed are skipped until they finish,
 * and so are meetings that were never transcribed (the audio is all there is).
 */
export async function applyAudioRetention(now = new Date()): Promise<number> {
  const workspaces = await prisma.workspace.findMany({
    where: { audioRetentionDays: { not: null } },
    select: { id: true, audioRetentionDays: true },
  });
  let deleted = 0;
  for (const ws of workspaces) {
    const days = ws.audioRetentionDays ?? 0;
    if (days < 1) continue;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    // Oldest first, page by page. Rows that are skipped (busy, or audio that
    // is the only copy) come back every day, so a single page could fill up
    // with them and the rest would never be reached.
    let cursor: string | undefined;
    let seen = 0;
    while (seen < MAX_ROWS_PER_WORKSPACE) {
      const page = await prisma.transcript.findMany({
        where: {
          workspaceId: ws.id,
          createdAt: { lt: cutoff },
          OR: [{ rawMicUrl: { not: null } }, { rawSysUrl: { not: null } }],
        },
        select: {
          id: true,
          rawMicUrl: true,
          rawSysUrl: true,
          metadata: true,
          transcript: true,
          utterances: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (page.length === 0) break;
      seen += page.length;
      cursor = page[page.length - 1].id;
      for (const t of page) {
        const status = (t.metadata as Prisma.JsonObject | null)?.processingStatus;
        if (typeof status === "string" && BUSY_STATUSES.has(status)) continue;
        if (audioIsOnlyCopy(t)) continue;
        try {
          if (await deleteTranscriptAudio(t, "retention")) deleted++;
        } catch (err) {
          if (err instanceof AudioInUseError) continue;
          logger.warn(`[audio-retention] could not delete the audio of ${t.id}`, err);
        }
      }
      if (page.length < PAGE_SIZE) break;
    }
  }
  return deleted;
}
