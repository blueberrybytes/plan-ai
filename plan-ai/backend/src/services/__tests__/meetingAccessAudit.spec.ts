import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../auditLogService", () => ({ recordAudit: mocks.recordAudit }));

import { recordMeetingAccess, resetMeetingAccessMemory } from "../meetingAccessAudit";

const base = {
  workspaceId: "w1",
  actor: { id: "u1", email: "ana@example.com" },
  transcriptId: "t1",
};
const MINUTE = 60 * 1000;

beforeEach(() => {
  mocks.recordAudit.mockClear();
  resetMeetingAccessMemory();
});

describe("recordMeetingAccess", () => {
  it("writes the read as a meeting action on the transcript", async () => {
    await recordMeetingAccess({ ...base, kind: "viewed", title: "Board meeting" });
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "w1",
        actor: base.actor,
        action: "meeting.viewed",
        targetType: "transcript",
        targetId: "t1",
        metadata: { title: "Board meeting" },
      }),
    );
  });

  it("writes one entry while the page keeps polling the same meeting", async () => {
    for (let i = 0; i < 20; i++) await recordMeetingAccess({ ...base, kind: "viewed" }, i * MINUTE);
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
  });

  it("writes again once the window has passed", async () => {
    await recordMeetingAccess({ ...base, kind: "viewed" }, 0);
    await recordMeetingAccess({ ...base, kind: "viewed" }, 31 * MINUTE);
    expect(mocks.recordAudit).toHaveBeenCalledTimes(2);
  });

  it("keeps people, meetings, kinds and channels apart", async () => {
    await recordMeetingAccess({ ...base, kind: "viewed" }, 0);
    await recordMeetingAccess({ ...base, actor: { id: "u2" }, kind: "viewed" }, 0);
    await recordMeetingAccess({ ...base, transcriptId: "t2", kind: "viewed" }, 0);
    await recordMeetingAccess({ ...base, kind: "audio_accessed" }, 0);
    await recordMeetingAccess({ ...base, kind: "viewed", channel: "mcp" }, 0);
    expect(mocks.recordAudit).toHaveBeenCalledTimes(5);
    expect(mocks.recordAudit.mock.calls[4][0].metadata).toEqual({ via: "mcp" });
  });

  it("never drops a sent email or a translation, however close together", async () => {
    await recordMeetingAccess({ ...base, kind: "notes_sent", detail: { recipients: 3 } }, 0);
    await recordMeetingAccess({ ...base, kind: "notes_sent", detail: { recipients: 1 } }, 1000);
    await recordMeetingAccess({ ...base, kind: "translated", detail: { language: "en" } }, 2000);
    await recordMeetingAccess({ ...base, kind: "translated", detail: { language: "en" } }, 3000);
    expect(mocks.recordAudit).toHaveBeenCalledTimes(4);
    expect(mocks.recordAudit.mock.calls[0][0]).toMatchObject({
      action: "meeting.notes_sent",
      metadata: { recipients: 3 },
    });
  });
});
