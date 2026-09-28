import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Sending meeting notes writes to people outside the workspace from our
 * domain, so the limits and the escaping matter more than the layout.
 */

const db = vi.hoisted(() => ({
  members: [] as { user: { email: string } }[],
  /** Rows the reservation UPDATE touches: 1 = reserved, 0 = meeting full. */
  reserveResult: 1,
  raw: [] as unknown[][],
  sent: [] as { to: string; replyTo: string; subject: string; html: string }[],
  failFor: new Set<string>(),
  quota: new Map<string, number>(),
}));

vi.mock("../../prisma/prismaClient", () => ({
  default: {
    workspaceMember: { findMany: async () => db.members },
    $executeRaw: async (...args: unknown[]) => {
      db.raw.push(args);
      return db.raw.length === 1 ? db.reserveResult : 1;
    },
  },
}));

vi.mock("../../utils/redisClient", () => ({
  redisClient: {
    incrby: async (key: string, n: number) => {
      const v = (db.quota.get(key) ?? 0) + n;
      db.quota.set(key, v);
      return v;
    },
    decrby: async (key: string, n: number) => {
      const v = (db.quota.get(key) ?? 0) - n;
      db.quota.set(key, v);
      return v;
    },
    expire: async () => 1,
  },
}));

vi.mock("../emailService", () => ({
  sendMeetingNotesEmail: async (input: {
    to: string;
    replyTo: string;
    subject: string;
    html: string;
  }) => {
    if (db.failFor.has(input.to)) throw new Error("resend down");
    db.sent.push(input);
  },
}));

import {
  MAX_NOTES_RECIPIENTS,
  MAX_NOTES_RECIPIENTS_PER_DAY,
  normalizeRecipients,
  notesContentOf,
  sendMeetingNotes,
} from "../meetingNotesEmailService";
import { renderMeetingNotesEmail } from "../templates/meetingNotes";

const transcript = (metadata: Record<string, unknown> = {}) => ({
  id: "t1",
  title: "Kickoff <b>Acme</b>",
  summary: "We agreed the scope.",
  metadata: {
    keyPoints: ["Scope approved"],
    rawTasks: [{ title: "Send the proposal", dueDate: "2026-10-02" }, { title: "" }, "junk"],
    ...metadata,
  },
  recordedAt: new Date("2026-09-27T10:00:00Z"),
  createdAt: new Date("2026-09-27T10:00:00Z"),
});
const sender = { id: "u1", name: "Ana López", email: "ana@acme.com" };

beforeEach(() => {
  db.members = [];
  db.reserveResult = 1;
  db.raw = [];
  db.sent = [];
  db.failFor = new Set();
  db.quota = new Map();
});

/** Daily recipients counted for the sender today. */
const quotaUsed = () => [...db.quota.values()].reduce((a, b) => a + b, 0);

describe("normalizeRecipients", () => {
  it("cleans, dedupes, drops the sender and reports bad addresses", () => {
    const { valid, invalid } = normalizeRecipients(
      [
        " Bob@Client.com ",
        "bob@client.com",
        "ana@acme.com",
        "not-an-email",
        "x@y",
        42,
        "eve@evil.com\nBcc: all@x.com",
      ],
      ["ANA@acme.com"],
    );
    expect(valid).toEqual(["bob@client.com"]);
    expect(invalid).toEqual(["not-an-email", "x@y", "eve@evil.com\nBcc: all@x.com"]);
  });

  it("returns nothing for input that is not a list", () => {
    expect(normalizeRecipients("bob@client.com")).toEqual({ valid: [], invalid: [] });
  });
});

describe("notesContentOf", () => {
  it("keeps only real tasks and key points", () => {
    const content = notesContentOf(transcript());
    expect(content.tasks).toEqual([{ title: "Send the proposal", dueDate: "2026-10-02" }]);
    expect(content.keyPoints).toEqual(["Scope approved"]);
    expect(content.summary).toBe("We agreed the scope.");
  });
});

describe("renderMeetingNotesEmail", () => {
  it("escapes the title, the summary and the message", () => {
    const html = renderMeetingNotesEmail({
      senderName: "Ana",
      senderEmail: "ana@acme.com",
      title: "<script>alert(1)</script>",
      recordedAt: null,
      summary: "a < b",
      keyPoints: [],
      tasks: [],
      message: '<img src=x onerror="steal()">',
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("sendMeetingNotes", () => {
  it("sends one email per person, links only for members and records the send", async () => {
    db.members = [{ user: { email: "Carl@Acme.com" } }];
    const result = await sendMeetingNotes({
      transcript: transcript(),
      workspaceId: "w1",
      sender,
      recipients: ["bob@client.com", "carl@acme.com"],
    });
    expect(result).toEqual({ sent: ["bob@client.com", "carl@acme.com"], failed: [], invalid: [] });
    expect(db.sent.map((s) => s.to)).toEqual(["bob@client.com", "carl@acme.com"]);
    expect(db.sent.every((s) => s.replyTo === "ana@acme.com")).toBe(true);
    expect(db.sent[0].html).not.toContain("/recordings/t1");
    expect(db.sent[1].html).toContain("/recordings/t1");
    expect(db.sent[0].html).not.toContain("<b>Acme</b>");
    // Reserved once for both people; nothing to correct afterwards.
    expect(db.raw).toHaveLength(1);
    expect(
      JSON.parse(String(db.raw[0].find((v) => typeof v === "string" && v.startsWith("[")))),
    ).toMatchObject([{ sentBy: "u1", count: 2 }]);
    expect(quotaUsed()).toBe(2);
  });

  it("reports the addresses that failed and does not record an empty send", async () => {
    db.failFor = new Set(["bob@client.com"]);
    const result = await sendMeetingNotes({
      transcript: transcript(),
      workspaceId: "w1",
      sender,
      recipients: ["bob@client.com"],
    });
    expect(result.failed).toEqual(["bob@client.com"]);
    // The reservation is settled to 0 (removed) and the quota given back.
    expect(db.raw).toHaveLength(2);
    expect(db.raw[1]).toContain(0);
    expect(quotaUsed()).toBe(0);
  });

  it("refuses too many people, a full meeting, the daily limit and meetings without notes", async () => {
    const many = Array.from({ length: MAX_NOTES_RECIPIENTS + 1 }, (_, i) => `p${i}@client.com`);
    await expect(
      sendMeetingNotes({ transcript: transcript(), workspaceId: "w1", sender, recipients: many }),
    ).rejects.toMatchObject({ status: 400 });

    // Another request took the last send of this meeting.
    db.reserveResult = 0;
    await expect(
      sendMeetingNotes({
        transcript: transcript(),
        workspaceId: "w1",
        sender,
        recipients: ["bob@client.com"],
      }),
    ).rejects.toMatchObject({ status: 429 });
    expect(quotaUsed()).toBe(0);

    db.reserveResult = 1;
    db.raw = [];
    // Ana already sent the notes to the daily maximum today.
    db.quota.set(
      `notes-email:u1:${new Date().toISOString().slice(0, 10)}`,
      MAX_NOTES_RECIPIENTS_PER_DAY,
    );
    await expect(
      sendMeetingNotes({
        transcript: transcript(),
        workspaceId: "w1",
        sender,
        recipients: ["bob@client.com"],
      }),
    ).rejects.toMatchObject({ status: 429 });
    db.quota.clear();

    await expect(
      sendMeetingNotes({
        transcript: { ...transcript({ keyPoints: [], rawTasks: [] }), summary: null },
        workspaceId: "w1",
        sender,
        recipients: ["bob@client.com"],
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(db.sent).toHaveLength(0);
  });
});
