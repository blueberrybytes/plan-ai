import { randomUUID } from "crypto";
import { Prisma, type Transcript } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import { logger } from "../utils/logger";
import { redisClient } from "../utils/redisClient";
import { sendMeetingNotesEmail } from "./emailService";
import { renderMeetingNotesEmail, type MeetingNotesEmailTask } from "./templates/meetingNotes";

/**
 * "Send the notes to the attendees": the user picks who gets the summary,
 * key points and action items of a meeting, usually the people in the
 * calendar invite. Always a manual action, never automatic.
 *
 * Each recipient gets their own email, so nobody sees the other addresses.
 * Replies go to the user who sent it. The limits keep the feature from being
 * used to send mail in bulk from the Plan AI domain: 30 people per send,
 * 5 sends per meeting (reserved atomically, so parallel requests cannot go
 * past it) and 200 recipients per user per day.
 */

export const MAX_NOTES_RECIPIENTS = 30;
export const MAX_NOTES_SENDS_PER_MEETING = 5;
export const MAX_NOTES_RECIPIENTS_PER_DAY = 200;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_TASKS = 30;
const MAX_KEY_POINTS = 15;

const APP_URL = (process.env.APP_URL || "https://plan-ai.blueberrybytes.com").replace(/\/+$/, "");
const EMAIL_RE = /^[^\s@<>,;:"()[\]\\]+@[^\s@<>,;:"()[\]\\]+\.[^\s@<>,;:"()[\]\\]{2,}$/;

export interface NotesEmailRecord {
  /** Absent on records written before sends were reserved. */
  id?: string;
  sentAt: string;
  sentBy: string;
  count: number;
}

/** Trimmed, lower-cased, without duplicates and without the excluded ones. */
export function normalizeRecipients(
  input: unknown,
  exclude: string[] = [],
): { valid: string[]; invalid: string[] } {
  const skip = new Set(exclude.map((e) => e.trim().toLowerCase()));
  const valid: string[] = [];
  const invalid: string[] = [];
  if (!Array.isArray(input)) return { valid, invalid };
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const email = raw.trim().toLowerCase();
    if (!email || skip.has(email) || valid.includes(email)) continue;
    if (email.length > 254 || !EMAIL_RE.test(email)) invalid.push(raw.trim());
    else valid.push(email);
  }
  return { valid, invalid };
}

/** Summary, key points and action items as the email shows them. */
export function notesContentOf(transcript: Pick<Transcript, "summary" | "metadata">): {
  summary: string | null;
  keyPoints: string[];
  tasks: MeetingNotesEmailTask[];
} {
  const metadata = (transcript.metadata as Prisma.JsonObject | null) ?? {};
  const keyPoints = Array.isArray(metadata.keyPoints)
    ? metadata.keyPoints.filter((p): p is string => typeof p === "string" && !!p.trim())
    : [];
  const tasks: MeetingNotesEmailTask[] = [];
  if (Array.isArray(metadata.rawTasks)) {
    for (const raw of metadata.rawTasks) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const task = raw as Record<string, unknown>;
      if (typeof task.title !== "string" || !task.title.trim()) continue;
      tasks.push({
        title: task.title.trim(),
        dueDate: typeof task.dueDate === "string" && task.dueDate.trim() ? task.dueDate : null,
      });
    }
  }
  return {
    summary: transcript.summary?.trim() || null,
    keyPoints: keyPoints.slice(0, MAX_KEY_POINTS),
    tasks: tasks.slice(0, MAX_TASKS),
  };
}

/** The sends recorded on a meeting, oldest first. */
export function notesEmailsOf(metadata: unknown): NotesEmailRecord[] {
  const list = (metadata as Record<string, unknown> | null)?.notesEmails;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (r): r is NotesEmailRecord =>
      !!r && typeof r === "object" && typeof (r as NotesEmailRecord).sentAt === "string",
  );
}

export class NotesEmailError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function sendMeetingNotes(input: {
  transcript: Pick<
    Transcript,
    "id" | "title" | "summary" | "metadata" | "recordedAt" | "createdAt"
  >;
  workspaceId: string;
  sender: { id: string; name: string | null; email: string };
  recipients: unknown;
  message?: string | null;
}): Promise<{ sent: string[]; failed: string[]; invalid: string[] }> {
  const { transcript, workspaceId, sender } = input;
  const { valid, invalid } = normalizeRecipients(input.recipients, [sender.email]);
  if (valid.length === 0) {
    throw new NotesEmailError(400, "Add at least one valid email address.");
  }
  if (valid.length > MAX_NOTES_RECIPIENTS) {
    throw new NotesEmailError(400, `At most ${MAX_NOTES_RECIPIENTS} people per send.`);
  }
  const message = input.message?.trim() ?? "";
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new NotesEmailError(
      400,
      `The message can have at most ${MAX_MESSAGE_LENGTH} characters.`,
    );
  }
  const content = notesContentOf(transcript);
  if (!content.summary && content.keyPoints.length === 0 && content.tasks.length === 0) {
    throw new NotesEmailError(409, "This meeting has no notes to send yet.");
  }

  if (!(await reserveDailyQuota(sender.id, valid.length))) {
    throw new NotesEmailError(
      429,
      `You can send the notes to at most ${MAX_NOTES_RECIPIENTS_PER_DAY} people a day.`,
    );
  }
  const record: NotesEmailRecord = {
    id: randomUUID(),
    sentAt: new Date().toISOString(),
    sentBy: sender.id,
    count: valid.length,
  };
  if (!(await reserveMeetingSend(transcript.id, record))) {
    await releaseDailyQuota(sender.id, valid.length);
    throw new NotesEmailError(
      429,
      `The notes of this meeting were already sent ${MAX_NOTES_SENDS_PER_MEETING} times.`,
    );
  }

  const sent: string[] = [];
  const failed: string[] = [];
  try {
    // Workspace members also get a link to the meeting. Others could not open it.
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId, user: { email: { in: valid, mode: "insensitive" } } },
      select: { user: { select: { email: true } } },
    });
    const memberEmails = new Set(members.map((m) => m.user.email.toLowerCase()));

    const title = transcript.title?.trim() || "Meeting";
    const senderName = sender.name?.trim() || sender.email;
    for (const to of valid) {
      const html = renderMeetingNotesEmail({
        senderName,
        senderEmail: sender.email,
        title,
        recordedAt: transcript.recordedAt ?? transcript.createdAt ?? null,
        ...content,
        message,
        meetingUrl: memberEmails.has(to) ? `${APP_URL}/recordings/${transcript.id}` : null,
      });
      try {
        await sendMeetingNotesEmail({
          to,
          replyTo: sender.email,
          senderName,
          subject: `Notes: ${title}`,
          html,
        });
        sent.push(to);
      } catch (err) {
        logger.warn(`[notes-email] could not send the notes of ${transcript.id}`, err);
        failed.push(to);
      }
    }
  } finally {
    // The reservation counted every address. Keep the ones that went out, or
    // drop the record when none did, and give back the unused daily quota.
    if (sent.length !== valid.length) {
      await settleMeetingSend(transcript.id, record.id!, sent.length).catch((err) =>
        logger.warn(`[notes-email] could not update the send record of ${transcript.id}`, err),
      );
      await releaseDailyQuota(sender.id, valid.length - sent.length);
    }
  }

  return { sent, failed, invalid };
}

// Metadata that is not an object, or a notesEmails that is not a list, is
// treated as empty instead of failing the update.
const METADATA = Prisma.sql`CASE WHEN jsonb_typeof("metadata") = 'object' THEN "metadata" ELSE '{}'::jsonb END`;
const SENDS = Prisma.sql`CASE WHEN jsonb_typeof("metadata"->'notesEmails') = 'array' THEN "metadata"->'notesEmails' ELSE '[]'::jsonb END`;

/**
 * Adds the send record only while the meeting has fewer than the maximum.
 * One statement, so two requests at the same time cannot both pass.
 */
export async function reserveMeetingSend(
  transcriptId: string,
  record: NotesEmailRecord,
): Promise<boolean> {
  const updated = await prisma.$executeRaw`
    UPDATE "Transcript"
    SET "metadata" = jsonb_set(${METADATA}, '{notesEmails}', ${SENDS} || ${JSON.stringify([record])}::jsonb)
    WHERE "id" = ${transcriptId}
      AND jsonb_array_length(${SENDS}) < ${MAX_NOTES_SENDS_PER_MEETING}`;
  return updated === 1;
}

/** Sets the real count on a reserved record, or removes it when it is 0. */
export async function settleMeetingSend(
  transcriptId: string,
  recordId: string,
  count: number,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "Transcript"
    SET "metadata" = jsonb_set("metadata", '{notesEmails}', COALESCE((
      SELECT jsonb_agg(
        CASE WHEN e->>'id' = ${recordId} THEN jsonb_set(e, '{count}', to_jsonb(${count}::int)) ELSE e END
        ORDER BY ord)
      FROM jsonb_array_elements("metadata"->'notesEmails') WITH ORDINALITY AS x(e, ord)
      WHERE NOT (${count}::int = 0 AND e->>'id' = ${recordId})
    ), '[]'::jsonb))
    WHERE "id" = ${transcriptId} AND jsonb_typeof("metadata"->'notesEmails') = 'array'`;
}

const dailyKey = (userId: string) =>
  `notes-email:${userId}:${new Date().toISOString().slice(0, 10)}`;

/**
 * Counts recipients per user and day in Redis. If Redis cannot be reached
 * the send goes ahead: the per-meeting limit still holds.
 */
async function reserveDailyQuota(userId: string, count: number): Promise<boolean> {
  const key = dailyKey(userId);
  try {
    const total = await redisClient.incrby(key, count);
    if (total === count) await redisClient.expire(key, 2 * 24 * 60 * 60);
    if (total > MAX_NOTES_RECIPIENTS_PER_DAY) {
      await redisClient.decrby(key, count);
      return false;
    }
    return true;
  } catch (err) {
    logger.warn("[notes-email] daily limit unavailable", err);
    return true;
  }
}

async function releaseDailyQuota(userId: string, count: number): Promise<void> {
  if (count <= 0) return;
  try {
    await redisClient.decrby(dailyKey(userId), count);
  } catch {
    // the key expires in two days anyway
  }
}
