/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const client: any = {
    personalProfile: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    workspace: { create: vi.fn() },
    workspaceMember: { create: vi.fn() },
    trackerEntry: { deleteMany: vi.fn() },
    tracker: { deleteMany: vi.fn() },
    note: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  client.$transaction = vi.fn((arg: any) =>
    typeof arg === "function" ? arg(client) : Promise.all(arg),
  );
  return client;
});
vi.mock("../../prisma/prismaClient", () => ({ default: db }));

import {
  PERSONAL_CONSENT_VERSION,
  enablePersonalMode,
  personalModeAvailable,
  requireTrackerAccess,
  withdrawPersonalConsent,
} from "../personalService";

const ana = { id: "ana", email: "Ana@Example.com" };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PERSONAL_MODE_EMAILS = "ana@example.com";
});
afterEach(() => {
  delete process.env.PERSONAL_MODE_EMAILS;
});

describe("the flag", () => {
  it("is off unless the email is listed", () => {
    expect(personalModeAvailable("ana@example.com")).toBe(true);
    expect(personalModeAvailable("bob@example.com")).toBe(false);
    delete process.env.PERSONAL_MODE_EMAILS;
    expect(personalModeAvailable("ana@example.com")).toBe(false);
    process.env.PERSONAL_MODE_EMAILS = "*";
    expect(personalModeAvailable("bob@example.com")).toBe(true);
  });
});

describe("turning personal mode on", () => {
  it("needs the box ticked", async () => {
    await expect(
      enablePersonalMode(ana, { consent: false, consentVersion: PERSONAL_CONSENT_VERSION }),
    ).rejects.toMatchObject({ status: 400, code: "consent_required" });
  });

  it("refuses an old consent text", async () => {
    await expect(
      enablePersonalMode(ana, { consent: true, consentVersion: "2020-01-01" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("refuses users outside the list", async () => {
    await expect(
      enablePersonalMode(
        { id: "bob", email: "bob@example.com" },
        { consent: true, consentVersion: PERSONAL_CONSENT_VERSION },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("creates a personal workspace with the user as its only owner", async () => {
    db.personalProfile.findUnique.mockResolvedValue(null);
    db.workspace.create.mockResolvedValue({ id: "ws-p" });
    db.personalProfile.create.mockImplementation(({ data }: any) => Promise.resolve(data));

    const status = await enablePersonalMode(ana, {
      consent: true,
      consentVersion: PERSONAL_CONSENT_VERSION,
    });

    expect(db.workspace.create.mock.calls[0][0].data).toMatchObject({
      kind: "PERSONAL",
      maxInvitations: 0,
    });
    expect(db.workspaceMember.create.mock.calls[0][0].data).toEqual({
      workspaceId: "ws-p",
      userId: "ana",
      role: "OWNER",
    });
    expect(status.enabled).toBe(true);
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe("personal.consent_given");
  });

  it("reuses the workspace when consent is given again", async () => {
    db.personalProfile.findUnique.mockResolvedValue({ userId: "ana", workspaceId: "ws-p" });
    db.personalProfile.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ userId: "ana", workspaceId: "ws-p", ...data }),
    );
    await enablePersonalMode(ana, { consent: true, consentVersion: PERSONAL_CONSENT_VERSION });
    expect(db.workspace.create).not.toHaveBeenCalled();
  });
});

describe("withdrawing consent", () => {
  it("deletes every tracker and entry of the user and keeps the notes", async () => {
    db.personalProfile.findUnique.mockResolvedValue({
      userId: "ana",
      workspaceId: "ws-p",
      consentAt: new Date(),
    });
    db.trackerEntry.deleteMany.mockResolvedValue({ count: 40 });
    db.tracker.deleteMany.mockResolvedValue({ count: 3 });
    db.note.updateMany.mockResolvedValue({ count: 5 });
    db.personalProfile.update.mockImplementation(({ data }: any) =>
      Promise.resolve({ userId: "ana", workspaceId: "ws-p", ...data }),
    );

    const status = await withdrawPersonalConsent(ana);

    expect(db.trackerEntry.deleteMany.mock.calls[0][0].where).toEqual({ userId: "ana" });
    expect(db.tracker.deleteMany.mock.calls[0][0].where).toEqual({ userId: "ana" });
    expect(status.enabled).toBe(false);
    expect(db.auditLog.create.mock.calls[0][0].data.metadata).toEqual({
      trackersDeleted: 3,
      entriesDeleted: 40,
    });
  });
});

describe("tracker access", () => {
  it("works only in the user's own personal workspace with consent", async () => {
    db.personalProfile.findUnique.mockResolvedValue({
      userId: "ana",
      workspaceId: "ws-p",
      consentAt: new Date(),
      consentVersion: PERSONAL_CONSENT_VERSION,
    });
    await expect(requireTrackerAccess(ana, "ws-p")).resolves.toBeUndefined();
    await expect(requireTrackerAccess(ana, "team-ws")).rejects.toMatchObject({ status: 403 });

    db.personalProfile.findUnique.mockResolvedValue({
      userId: "ana",
      workspaceId: "ws-p",
      consentAt: null,
    });
    await expect(requireTrackerAccess(ana, "ws-p")).rejects.toMatchObject({ status: 403 });
  });

  it("waits for the new consent text to be accepted", async () => {
    db.personalProfile.findUnique.mockResolvedValue({
      userId: "ana",
      workspaceId: "ws-p",
      consentAt: new Date(),
      consentVersion: "2026-01-01",
    });
    await expect(requireTrackerAccess(ana, "ws-p")).rejects.toMatchObject({
      status: 409,
      code: "consent_outdated",
    });
  });

  it("stops when the email is taken off the list", async () => {
    db.personalProfile.findUnique.mockResolvedValue({
      userId: "ana",
      workspaceId: "ws-p",
      consentAt: new Date(),
    });
    process.env.PERSONAL_MODE_EMAILS = "";
    await expect(requireTrackerAccess(ana, "ws-p")).rejects.toMatchObject({ status: 403 });
  });
});
