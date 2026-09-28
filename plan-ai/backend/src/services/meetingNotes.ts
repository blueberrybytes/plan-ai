import type { Prisma } from "@prisma/client";

/** A moment the person recording marked during the meeting. */
export interface RecordingBookmark {
  /** Seconds from the start of the recorded audio (pauses excluded). */
  atSeconds: number;
  /** Optional short note typed with the mark. */
  note?: string;
}

/** The calendar event the recording belongs to, as the client saw it. */
export interface MeetingCalendarEvent {
  title: string;
  start?: string;
  end?: string;
  attendees: { name?: string; email: string }[];
  meetingUrl?: string;
  provider?: string;
}

const MAX_BOOKMARKS = 200;
const MAX_NOTE_CHARS = 500;
const MAX_ATTENDEES = 100;

const clean = (s: unknown, max: number): string | undefined => {
  if (typeof s !== "string") return undefined;
  const t = s.replace(/\s+/g, " ").trim().slice(0, max);
  return t || undefined;
};

/** Validates bookmarks sent by a client (JSON form field). Invalid input yields []. */
export function parseBookmarks(raw: string | undefined): RecordingBookmark[] {
  if (!raw || raw.length > 200_000) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data
    .slice(0, MAX_BOOKMARKS)
    .flatMap((b): RecordingBookmark[] => {
      const at = Number((b as { atSeconds?: unknown })?.atSeconds);
      if (!Number.isFinite(at) || at < 0 || at > 7 * 24 * 3600) return [];
      const note = clean((b as { note?: unknown })?.note, MAX_NOTE_CHARS);
      return [{ atSeconds: Math.round(at * 10) / 10, ...(note ? { note } : {}) }];
    })
    .sort((a, b) => a.atSeconds - b.atSeconds);
}

/** Validates the calendar event sent by a client. Invalid input yields undefined. */
export function parseCalendarEvent(raw: string | undefined): MeetingCalendarEvent | undefined {
  if (!raw || raw.length > 100_000) return undefined;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const title = clean(data?.title, 300);
  if (!title) return undefined;
  const attendees = Array.isArray(data.attendees)
    ? data.attendees.slice(0, MAX_ATTENDEES).flatMap((a) => {
        const email = clean((a as { email?: unknown })?.email, 320);
        if (!email || !email.includes("@")) return [];
        const name = clean((a as { name?: unknown })?.name, 200);
        return [{ email, ...(name ? { name } : {}) }];
      })
    : [];
  const iso = (v: unknown) => {
    const s = clean(v, 40);
    return s && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : undefined;
  };
  const url = clean(data.meetingUrl, 2000);
  return {
    title,
    attendees,
    ...(iso(data.start) ? { start: iso(data.start) } : {}),
    ...(iso(data.end) ? { end: iso(data.end) } : {}),
    ...(url && /^https:\/\//i.test(url) ? { meetingUrl: url } : {}),
    ...(clean(data.provider, 40) ? { provider: clean(data.provider, 40) } : {}),
  };
}

const mmss = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

/**
 * Extra context for the AI steps, built from what the client sent with the
 * recording: the moments the user marked and the calendar invite. Empty when
 * there is neither.
 */
export function meetingNotesForAi(metadata: Prisma.JsonObject | null | undefined): string {
  const parts: string[] = [];
  const event = metadata?.calendarEvent as MeetingCalendarEvent | undefined;
  if (event?.title) {
    const people = (event.attendees ?? [])
      .map((a) => (a.name ? `${a.name} <${a.email}>` : a.email))
      .join(", ");
    parts.push(
      `Calendar invite for this meeting: "${event.title}".${people ? ` Invited: ${people}.` : ""}`,
    );
  }
  const bookmarks = (metadata?.bookmarks as RecordingBookmark[] | undefined) ?? [];
  if (bookmarks.length > 0) {
    parts.push(
      "The person recording marked these moments as important (time from the start of the recording). Give what was said around them priority in the summary and the tasks:\n" +
        bookmarks
          .slice(0, 50)
          .map((b) => `- [${mmss(b.atSeconds)}]${b.note ? ` ${b.note}` : ""}`)
          .join("\n"),
    );
  }
  return parts.join("\n\n");
}

/** Attendee names from the calendar invite, to help name the speakers. */
export function attendeeNames(metadata: Prisma.JsonObject | null | undefined): string[] {
  const event = metadata?.calendarEvent as MeetingCalendarEvent | undefined;
  return (event?.attendees ?? []).map((a) => a.name?.trim()).filter((n): n is string => !!n);
}
