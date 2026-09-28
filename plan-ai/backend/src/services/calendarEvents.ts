// Pure calendar event logic: turn raw Google Calendar and Microsoft Graph
// events into one shape, then pick the meeting the user is most likely in.
// No network and no database here, so all of it is unit tested.

/** Calendar the meeting came from. */
export type CalendarProvider = "GOOGLE_CALENDAR" | "OUTLOOK_CALENDAR";

export interface CurrentMeetingAttendee {
  name?: string;
  email: string;
}

/** The meeting the recorder should use to name the recording and the speakers. */
export interface CurrentMeeting {
  title: string;
  start: Date;
  end: Date;
  attendees: CurrentMeetingAttendee[];
  meetingUrl?: string;
  provider: CalendarProvider;
}

/** One event from any provider, before we decide which one is current. */
export interface CalendarEventCandidate {
  provider: CalendarProvider;
  title: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  isCancelled: boolean;
  /** The calendar owner declined it. */
  isDeclined: boolean;
  attendees: CurrentMeetingAttendee[];
  meetingUrl?: string;
}

/** How far before and after "now" we look for a meeting. */
export const CURRENT_MEETING_WINDOW_MS = 15 * 60 * 1000;

// ── Raw provider shapes (only the fields we read) ─────────────────────────────

export interface GoogleCalendarEvent {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  eventType?: string;
  hangoutLink?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: {
    email?: string;
    displayName?: string;
    self?: boolean;
    resource?: boolean;
    organizer?: boolean;
    responseStatus?: string;
  }[];
  organizer?: { email?: string; displayName?: string; self?: boolean };
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
}

export interface OutlookCalendarEvent {
  id?: string;
  subject?: string;
  isAllDay?: boolean;
  isCancelled?: boolean;
  showAs?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  responseStatus?: { response?: string };
  attendees?: {
    type?: string;
    status?: { response?: string };
    emailAddress?: { name?: string; address?: string };
  }[];
  organizer?: { emailAddress?: { name?: string; address?: string } };
  onlineMeeting?: { joinUrl?: string } | null;
  onlineMeetingUrl?: string | null;
  location?: { displayName?: string };
  bodyPreview?: string;
}

// ── Meeting links ─────────────────────────────────────────────────────────────

const MEETING_HOSTS = [
  "zoom.us",
  "zoomgov.com",
  "meet.google.com",
  "teams.microsoft.com",
  "teams.live.com",
  "webex.com",
  "whereby.com",
  "meet.jit.si",
  "gotomeeting.com",
  "chime.aws",
];

const URL_PATTERN = /https?:\/\/[^\s<>"'()[\]]+/gi;

const isMeetingHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  return MEETING_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
};

/**
 * First video call link found in free text (location, description). Only known
 * meeting hosts count, so a link to a shared doc in the description is ignored.
 */
export const extractMeetingUrl = (texts: (string | null | undefined)[]): string | undefined => {
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.match(URL_PATTERN) ?? []) {
      const candidate = match.replace(/[.,;:!?]+$/, "");
      try {
        if (isMeetingHost(new URL(candidate).hostname)) return candidate;
      } catch {
        // Not a valid URL, try the next one.
      }
    }
  }
  return undefined;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const parseDate = (value: string | undefined): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Graph returns "2026-09-27T10:00:00.0000000" with the zone in a separate
 * field. We ask for UTC, so a value without an offset is read as UTC.
 */
const parseGraphDate = (value: string | undefined): Date | null => {
  if (!value) return null;
  const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return parseDate(hasOffset ? value : `${value}Z`);
};

/** Adds a person once, matching emails without case. Skips entries with no email. */
const addAttendee = (
  list: CurrentMeetingAttendee[],
  email: string | undefined,
  name: string | undefined,
): void => {
  const cleanEmail = email?.trim();
  if (!cleanEmail) return;
  const key = cleanEmail.toLowerCase();
  if (list.some((a) => a.email.toLowerCase() === key)) return;
  const cleanName = name?.trim();
  list.push(
    cleanName && cleanName !== cleanEmail
      ? { name: cleanName, email: cleanEmail }
      : { email: cleanEmail },
  );
};

// ── Normalizers ───────────────────────────────────────────────────────────────

/** Google event types that block time but are not meetings. */
const GOOGLE_NON_MEETING_TYPES = new Set([
  "outOfOffice",
  "focusTime",
  "workingLocation",
  "birthday",
  "fromGmail",
]);

/** Google calendars that act as organizer for shared calendars, not people. */
const isGoogleCalendarAddress = (email: string | undefined): boolean =>
  Boolean(email && /calendar\.google\.com$/i.test(email));

export const normalizeGoogleEvent = (event: GoogleCalendarEvent): CalendarEventCandidate | null => {
  if (event.eventType && GOOGLE_NON_MEETING_TYPES.has(event.eventType)) return null;

  const isAllDay = Boolean(event.start?.date && !event.start?.dateTime);
  const start = parseDate(event.start?.dateTime ?? event.start?.date);
  const end = parseDate(event.end?.dateTime ?? event.end?.date);
  if (!start || !end) return null;

  const self = event.attendees?.find((a) => a.self);

  const attendees: CurrentMeetingAttendee[] = [];
  for (const attendee of event.attendees ?? []) {
    // Rooms and people who said no are not in the meeting.
    if (attendee.resource || attendee.responseStatus === "declined") continue;
    addAttendee(attendees, attendee.email, attendee.displayName);
  }
  if (!isGoogleCalendarAddress(event.organizer?.email)) {
    addAttendee(attendees, event.organizer?.email, event.organizer?.displayName);
  }

  const videoEntry = event.conferenceData?.entryPoints?.find(
    (entry) => entry.entryPointType === "video" && entry.uri,
  );
  const meetingUrl =
    videoEntry?.uri || event.hangoutLink || extractMeetingUrl([event.location, event.description]);

  return {
    provider: "GOOGLE_CALENDAR",
    title: event.summary?.trim() ?? "",
    start,
    end,
    isAllDay,
    isCancelled: event.status === "cancelled",
    isDeclined: self?.responseStatus === "declined",
    attendees,
    ...(meetingUrl ? { meetingUrl } : {}),
  };
};

export const normalizeOutlookEvent = (
  event: OutlookCalendarEvent,
): CalendarEventCandidate | null => {
  // "oof" is an out of office block, not a meeting.
  if (event.showAs === "oof") return null;

  const start = parseGraphDate(event.start?.dateTime);
  const end = parseGraphDate(event.end?.dateTime);
  if (!start || !end) return null;

  const attendees: CurrentMeetingAttendee[] = [];
  // Graph does not list the organizer among the attendees.
  addAttendee(
    attendees,
    event.organizer?.emailAddress?.address,
    event.organizer?.emailAddress?.name,
  );
  for (const attendee of event.attendees ?? []) {
    if (attendee.type === "resource" || attendee.status?.response === "declined") continue;
    addAttendee(attendees, attendee.emailAddress?.address, attendee.emailAddress?.name);
  }

  const meetingUrl =
    event.onlineMeeting?.joinUrl ||
    event.onlineMeetingUrl ||
    extractMeetingUrl([event.location?.displayName, event.bodyPreview]);

  return {
    provider: "OUTLOOK_CALENDAR",
    title: event.subject?.trim() ?? "",
    start,
    end,
    isAllDay: Boolean(event.isAllDay),
    isCancelled: Boolean(event.isCancelled),
    isDeclined: event.responseStatus?.response === "declined",
    attendees,
    ...(meetingUrl ? { meetingUrl } : {}),
  };
};

// ── Selection ─────────────────────────────────────────────────────────────────

const toCurrentMeeting = (event: CalendarEventCandidate): CurrentMeeting => ({
  title: event.title,
  start: event.start,
  end: event.end,
  attendees: event.attendees,
  ...(event.meetingUrl ? { meetingUrl: event.meetingUrl } : {}),
  provider: event.provider,
});

/** On equal start times, an event with a call link is more likely the real meeting. */
const compareTies = (a: CalendarEventCandidate, b: CalendarEventCandidate): number => {
  const linkDiff = Number(Boolean(b.meetingUrl)) - Number(Boolean(a.meetingUrl));
  if (linkDiff !== 0) return linkDiff;
  return a.end.getTime() - b.end.getTime();
};

/**
 * Picks the meeting happening now. An event in progress wins, and among
 * several the one that started last (a meeting inside a long block). With
 * nothing in progress, the event starting soonest within the window.
 * All-day, cancelled and declined events never count.
 */
export const selectCurrentMeeting = (
  events: CalendarEventCandidate[],
  now: Date,
  windowMs: number = CURRENT_MEETING_WINDOW_MS,
): CurrentMeeting | null => {
  const nowMs = now.getTime();

  const eligible = events.filter(
    (e) =>
      !e.isAllDay &&
      !e.isCancelled &&
      !e.isDeclined &&
      !Number.isNaN(e.start.getTime()) &&
      !Number.isNaN(e.end.getTime()) &&
      e.end.getTime() > e.start.getTime(),
  );

  const inProgress = eligible
    .filter((e) => e.start.getTime() <= nowMs && e.end.getTime() > nowMs)
    .sort((a, b) => b.start.getTime() - a.start.getTime() || compareTies(a, b));
  if (inProgress.length > 0) return toCurrentMeeting(inProgress[0]);

  const upcoming = eligible
    .filter((e) => e.start.getTime() > nowMs && e.start.getTime() - nowMs <= windowMs)
    .sort((a, b) => a.start.getTime() - b.start.getTime() || compareTies(a, b));
  if (upcoming.length > 0) return toCurrentMeeting(upcoming[0]);

  return null;
};
