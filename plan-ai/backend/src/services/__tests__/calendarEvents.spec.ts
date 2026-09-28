import { describe, it, expect } from "vitest";
import {
  extractMeetingUrl,
  normalizeGoogleEvent,
  normalizeOutlookEvent,
  selectCurrentMeeting,
  type CalendarEventCandidate,
} from "../calendarEvents";

const NOW = new Date("2026-09-27T10:00:00Z");
const at = (hhmm: string) => new Date(`2026-09-27T${hhmm}:00Z`);

const event = (overrides: Partial<CalendarEventCandidate>): CalendarEventCandidate => ({
  provider: "GOOGLE_CALENDAR",
  title: "Meeting",
  start: at("09:30"),
  end: at("10:30"),
  isAllDay: false,
  isCancelled: false,
  isDeclined: false,
  attendees: [],
  ...overrides,
});

describe("selectCurrentMeeting", () => {
  it("returns null when there are no events", () => {
    expect(selectCurrentMeeting([], NOW)).toBeNull();
  });

  it("prefers an event in progress over one starting soon", () => {
    const result = selectCurrentMeeting(
      [
        event({ title: "Upcoming", start: at("10:05"), end: at("10:30") }),
        event({ title: "Running", start: at("09:45"), end: at("10:15") }),
      ],
      NOW,
    );
    expect(result?.title).toBe("Running");
  });

  it("picks the upcoming event that starts soonest when nothing is in progress", () => {
    const result = selectCurrentMeeting(
      [
        event({ title: "Later", start: at("10:12"), end: at("10:40") }),
        event({ title: "Sooner", start: at("10:04"), end: at("10:30") }),
      ],
      NOW,
    );
    expect(result?.title).toBe("Sooner");
  });

  it("ignores events that start more than 15 minutes from now", () => {
    expect(selectCurrentMeeting([event({ start: at("10:16"), end: at("11:00") })], NOW)).toBeNull();
  });

  it("counts an event that starts exactly now as in progress", () => {
    const result = selectCurrentMeeting(
      [
        event({ title: "Starts now", start: at("10:00"), end: at("10:30") }),
        event({ title: "Next", start: at("10:05"), end: at("10:30") }),
      ],
      NOW,
    );
    expect(result?.title).toBe("Starts now");
  });

  it("ignores events that already ended", () => {
    expect(selectCurrentMeeting([event({ start: at("09:00"), end: at("10:00") })], NOW)).toBeNull();
  });

  it("skips all-day events", () => {
    const result = selectCurrentMeeting(
      [
        event({ title: "Holiday", isAllDay: true, start: at("00:00"), end: at("23:59") }),
        event({ title: "Standup", start: at("10:10"), end: at("10:25") }),
      ],
      NOW,
    );
    expect(result?.title).toBe("Standup");
  });

  it("skips declined events", () => {
    const result = selectCurrentMeeting(
      [
        event({ title: "Declined", isDeclined: true }),
        event({ title: "Accepted", start: at("10:10"), end: at("10:40") }),
      ],
      NOW,
    );
    expect(result?.title).toBe("Accepted");
  });

  it("skips cancelled events", () => {
    expect(selectCurrentMeeting([event({ isCancelled: true })], NOW)).toBeNull();
  });

  it("with overlapping events in progress, picks the one that started last", () => {
    const result = selectCurrentMeeting(
      [
        event({ title: "Focus block", start: at("09:00"), end: at("12:00") }),
        event({ title: "Client call", start: at("09:50"), end: at("10:20") }),
        event({ title: "Standup", start: at("09:30"), end: at("10:15") }),
      ],
      NOW,
    );
    expect(result?.title).toBe("Client call");
  });

  it("on equal start times, prefers the event with a call link", () => {
    const result = selectCurrentMeeting(
      [
        event({ title: "Hold", start: at("09:50"), end: at("10:20") }),
        event({
          title: "Call",
          start: at("09:50"),
          end: at("10:50"),
          meetingUrl: "https://meet.google.com/abc-defg-hij",
        }),
      ],
      NOW,
    );
    expect(result?.title).toBe("Call");
  });

  it("merges calendars from both providers", () => {
    const result = selectCurrentMeeting(
      [
        event({
          provider: "GOOGLE_CALENDAR",
          title: "Google",
          start: at("09:00"),
          end: at("11:00"),
        }),
        event({
          provider: "OUTLOOK_CALENDAR",
          title: "Outlook",
          start: at("09:55"),
          end: at("10:30"),
        }),
      ],
      NOW,
    );
    expect(result).toMatchObject({ title: "Outlook", provider: "OUTLOOK_CALENDAR" });
  });

  it("returns the public shape without internal flags", () => {
    const result = selectCurrentMeeting(
      [
        event({
          title: "Review",
          attendees: [{ name: "Ana", email: "ana@example.com" }],
          meetingUrl: "https://zoom.us/j/123",
        }),
      ],
      NOW,
    );
    expect(result).toEqual({
      title: "Review",
      start: at("09:30"),
      end: at("10:30"),
      attendees: [{ name: "Ana", email: "ana@example.com" }],
      meetingUrl: "https://zoom.us/j/123",
      provider: "GOOGLE_CALENDAR",
    });
  });

  it("leaves out meetingUrl when there is none", () => {
    const result = selectCurrentMeeting([event({})], NOW);
    expect(result).not.toHaveProperty("meetingUrl");
  });
});

describe("normalizeGoogleEvent", () => {
  it("reads title, times, attendees and the Meet link", () => {
    const result = normalizeGoogleEvent({
      status: "confirmed",
      summary: " Weekly sync ",
      start: { dateTime: "2026-09-27T11:30:00+02:00" },
      end: { dateTime: "2026-09-27T12:00:00+02:00" },
      hangoutLink: "https://meet.google.com/abc-defg-hij",
      organizer: { email: "lead@example.com", displayName: "Lead" },
      attendees: [
        { email: "me@example.com", self: true, responseStatus: "accepted" },
        { email: "lead@example.com", displayName: "Lead", organizer: true },
        { email: "room-1@resource.calendar.google.com", resource: true },
        { email: "gone@example.com", responseStatus: "declined" },
      ],
    });
    expect(result).toMatchObject({
      provider: "GOOGLE_CALENDAR",
      title: "Weekly sync",
      start: at("09:30"),
      end: at("10:00"),
      isAllDay: false,
      isCancelled: false,
      isDeclined: false,
      meetingUrl: "https://meet.google.com/abc-defg-hij",
    });
    expect(result?.attendees).toEqual([
      { email: "me@example.com" },
      { name: "Lead", email: "lead@example.com" },
    ]);
  });

  it("flags all-day, cancelled and declined events", () => {
    expect(
      normalizeGoogleEvent({ start: { date: "2026-09-27" }, end: { date: "2026-09-28" } })
        ?.isAllDay,
    ).toBe(true);
    expect(
      normalizeGoogleEvent({
        status: "cancelled",
        start: { dateTime: "2026-09-27T10:00:00Z" },
        end: { dateTime: "2026-09-27T11:00:00Z" },
      })?.isCancelled,
    ).toBe(true);
    expect(
      normalizeGoogleEvent({
        start: { dateTime: "2026-09-27T10:00:00Z" },
        end: { dateTime: "2026-09-27T11:00:00Z" },
        attendees: [{ email: "me@example.com", self: true, responseStatus: "declined" }],
      })?.isDeclined,
    ).toBe(true);
  });

  it("drops focus time, out of office and working location blocks", () => {
    for (const eventType of ["focusTime", "outOfOffice", "workingLocation"]) {
      expect(
        normalizeGoogleEvent({
          eventType,
          start: { dateTime: "2026-09-27T09:00:00Z" },
          end: { dateTime: "2026-09-27T17:00:00Z" },
        }),
      ).toBeNull();
    }
  });

  it("takes a Zoom link from the conference data or the location", () => {
    expect(
      normalizeGoogleEvent({
        start: { dateTime: "2026-09-27T10:00:00Z" },
        end: { dateTime: "2026-09-27T11:00:00Z" },
        conferenceData: {
          entryPoints: [
            { entryPointType: "phone", uri: "tel:+1-555" },
            { entryPointType: "video", uri: "https://us02web.zoom.us/j/111" },
          ],
        },
      })?.meetingUrl,
    ).toBe("https://us02web.zoom.us/j/111");
    expect(
      normalizeGoogleEvent({
        start: { dateTime: "2026-09-27T10:00:00Z" },
        end: { dateTime: "2026-09-27T11:00:00Z" },
        location: "https://zoom.us/j/222.",
      })?.meetingUrl,
    ).toBe("https://zoom.us/j/222");
  });

  it("returns null when the times are missing", () => {
    expect(normalizeGoogleEvent({ summary: "Broken" })).toBeNull();
  });
});

describe("normalizeOutlookEvent", () => {
  it("reads UTC times without offset, the organizer and the Teams link", () => {
    const result = normalizeOutlookEvent({
      subject: "Kickoff",
      start: { dateTime: "2026-09-27T09:45:00.0000000", timeZone: "UTC" },
      end: { dateTime: "2026-09-27T10:30:00.0000000", timeZone: "UTC" },
      responseStatus: { response: "accepted" },
      organizer: { emailAddress: { name: "Omar", address: "omar@client.ae" } },
      attendees: [
        { type: "required", emailAddress: { name: "Xavier", address: "xavier@example.com" } },
        { type: "resource", emailAddress: { name: "Room", address: "room@client.ae" } },
        {
          type: "optional",
          status: { response: "declined" },
          emailAddress: { address: "no@client.ae" },
        },
      ],
      onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meetup-join/xyz" },
    });
    expect(result).toMatchObject({
      provider: "OUTLOOK_CALENDAR",
      title: "Kickoff",
      start: at("09:45"),
      end: at("10:30"),
      isAllDay: false,
      isDeclined: false,
      meetingUrl: "https://teams.microsoft.com/l/meetup-join/xyz",
    });
    expect(result?.attendees).toEqual([
      { name: "Omar", email: "omar@client.ae" },
      { name: "Xavier", email: "xavier@example.com" },
    ]);
  });

  it("flags all-day, cancelled and declined events and drops out of office", () => {
    const base = {
      start: { dateTime: "2026-09-27T00:00:00.0000000", timeZone: "UTC" },
      end: { dateTime: "2026-09-28T00:00:00.0000000", timeZone: "UTC" },
    };
    expect(normalizeOutlookEvent({ ...base, isAllDay: true })?.isAllDay).toBe(true);
    expect(normalizeOutlookEvent({ ...base, isCancelled: true })?.isCancelled).toBe(true);
    expect(
      normalizeOutlookEvent({ ...base, responseStatus: { response: "declined" } })?.isDeclined,
    ).toBe(true);
    expect(normalizeOutlookEvent({ ...base, showAs: "oof" })).toBeNull();
  });
});

describe("extractMeetingUrl", () => {
  it("ignores links that are not video calls", () => {
    expect(
      extractMeetingUrl([
        "Agenda: https://docs.google.com/document/d/1 then https://meet.google.com/x",
      ]),
    ).toBe("https://meet.google.com/x");
    expect(extractMeetingUrl(["https://example.com/zoom.us", undefined, null])).toBeUndefined();
  });
});
