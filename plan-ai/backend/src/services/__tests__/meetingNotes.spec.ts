import { describe, it, expect } from "vitest";
import {
  attendeeNames,
  meetingNotesForAi,
  parseBookmarks,
  parseCalendarEvent,
} from "../meetingNotes";

describe("bookmarks from the client", () => {
  it("keeps valid marks, sorted, with trimmed notes", () => {
    const parsed = parseBookmarks(
      JSON.stringify([
        { atSeconds: 125.44, note: "  budget   decision " },
        { atSeconds: 12 },
        { atSeconds: -3 },
        { atSeconds: "x" },
      ]),
    );
    expect(parsed).toEqual([{ atSeconds: 12 }, { atSeconds: 125.4, note: "budget decision" }]);
  });

  it("ignores garbage", () => {
    expect(parseBookmarks("not json")).toEqual([]);
    expect(parseBookmarks(JSON.stringify({ atSeconds: 1 }))).toEqual([]);
    expect(parseBookmarks(undefined)).toEqual([]);
  });
});

describe("calendar event from the client", () => {
  it("keeps title, valid attendees and https links only", () => {
    const e = parseCalendarEvent(
      JSON.stringify({
        title: "Weekly sync",
        start: "2026-09-27T10:00:00Z",
        attendees: [{ name: "Nayla", email: "nayla@example.com" }, { email: "nope" }],
        meetingUrl: "javascript:alert(1)",
      }),
    );
    expect(e).toEqual({
      title: "Weekly sync",
      start: "2026-09-27T10:00:00.000Z",
      attendees: [{ name: "Nayla", email: "nayla@example.com" }],
    });
  });

  it("needs a title", () => {
    expect(parseCalendarEvent(JSON.stringify({ attendees: [] }))).toBeUndefined();
  });
});

describe("notes for the AI", () => {
  it("lists the invite and the marked moments", () => {
    const notes = meetingNotesForAi({
      calendarEvent: {
        title: "Weekly sync",
        attendees: [{ name: "Nayla", email: "nayla@example.com" }],
      },
      bookmarks: [{ atSeconds: 3725, note: "pricing" }, { atSeconds: 61 }],
    });
    expect(notes).toContain('Calendar invite for this meeting: "Weekly sync"');
    expect(notes).toContain("Nayla <nayla@example.com>");
    expect(notes).toContain("- [1:02:05] pricing");
    expect(notes).toContain("- [1:01]");
  });

  it("is empty without either", () => {
    expect(meetingNotesForAi({})).toBe("");
    expect(attendeeNames({})).toEqual([]);
  });
});
