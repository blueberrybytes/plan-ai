import type { PersonalProfile } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import { recordAudit, type AuditRequestInfo } from "./auditLogService";

/**
 * Personal mode: a workspace that belongs to one user, with trackers for
 * things they measure (food, steps, weight, habits). Food, weight and steps
 * are health data under the GDPR, so trackers need the user's explicit
 * consent, stay private to that user and are never read by the assistant.
 *
 * It is off unless PERSONAL_MODE_EMAILS lists the user's email ("*" turns
 * it on for everyone).
 */

/** Bump when the consent text in the apps changes, so users accept it again. */
export const PERSONAL_CONSENT_VERSION = "2026-09-30";
export const PERSONAL_WORKSPACE_NAME = "Personal";

export interface PersonalError {
  status: number;
  message: string;
  code?: string;
}

const fail = (status: number, message: string, code?: string): PersonalError => ({
  status,
  message,
  ...(code ? { code } : {}),
});

export function personalModeAvailable(email: string | null | undefined): boolean {
  const list = (process.env.PERSONAL_MODE_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (list.includes("*")) return true;
  return !!email && list.includes(email.trim().toLowerCase());
}

export interface PersonalStatus {
  available: boolean;
  enabled: boolean;
  workspaceId: string | null;
  consentAt: Date | null;
  consentVersion: string | null;
  /** The accepted consent is older than the current text. */
  consentOutdated: boolean;
  hideCalories: boolean;
  autoExtract: boolean;
}

const statusOf = (available: boolean, profile: PersonalProfile | null): PersonalStatus => ({
  available,
  enabled: !!profile?.consentAt,
  workspaceId: profile?.workspaceId ?? null,
  consentAt: profile?.consentAt ?? null,
  consentVersion: profile?.consentVersion ?? null,
  consentOutdated: !!profile?.consentAt && profile.consentVersion !== PERSONAL_CONSENT_VERSION,
  hideCalories: profile?.hideCalories ?? false,
  autoExtract: profile?.autoExtract ?? true,
});

export interface PersonalUser {
  id: string;
  email: string | null;
}

export async function getPersonalStatus(user: PersonalUser): Promise<PersonalStatus> {
  const profile = await prisma.personalProfile.findUnique({ where: { userId: user.id } });
  return statusOf(personalModeAvailable(user.email), profile);
}

/**
 * Records the consent and creates the personal workspace the first time.
 * Giving consent again (after withdrawing it, or for a new text) reuses the
 * same workspace.
 */
export async function enablePersonalMode(
  user: PersonalUser,
  input: { consent: boolean; consentVersion: string },
  request?: AuditRequestInfo,
): Promise<PersonalStatus> {
  if (!personalModeAvailable(user.email)) {
    throw fail(403, "Personal mode is not available for this account.", "personal_mode_unavailable");
  }
  if (input?.consent !== true) {
    throw fail(400, "Personal mode needs your explicit consent.", "consent_required");
  }
  if (input.consentVersion !== PERSONAL_CONSENT_VERSION) {
    throw fail(409, "The consent text has changed. Reload and read it again.", "consent_outdated");
  }

  const now = new Date();
  const profile = await prisma.$transaction(async (tx) => {
    const existing = await tx.personalProfile.findUnique({ where: { userId: user.id } });
    if (existing) {
      return tx.personalProfile.update({
        where: { userId: user.id },
        data: { consentAt: now, consentVersion: PERSONAL_CONSENT_VERSION },
      });
    }
    const workspace = await tx.workspace.create({
      data: { name: PERSONAL_WORKSPACE_NAME, kind: "PERSONAL", maxInvitations: 0 },
    });
    await tx.workspaceMember.create({
      data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" },
    });
    return tx.personalProfile.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
        consentAt: now,
        consentVersion: PERSONAL_CONSENT_VERSION,
      },
    });
  });

  await recordAudit({
    workspaceId: profile.workspaceId,
    actor: user,
    action: "personal.consent_given",
    metadata: { consentVersion: PERSONAL_CONSENT_VERSION },
    request,
  });
  return statusOf(true, profile);
}

export async function updatePersonalSettings(
  user: PersonalUser,
  input: { hideCalories?: boolean; autoExtract?: boolean },
): Promise<PersonalStatus> {
  const profile = await prisma.personalProfile.findUnique({ where: { userId: user.id } });
  if (!profile) throw fail(404, "Personal mode is not set up.", "personal_mode_required");
  const updated = await prisma.personalProfile.update({
    where: { userId: user.id },
    data: {
      ...(typeof input?.hideCalories === "boolean" ? { hideCalories: input.hideCalories } : {}),
      ...(typeof input?.autoExtract === "boolean" ? { autoExtract: input.autoExtract } : {}),
    },
  });
  return statusOf(personalModeAvailable(user.email), updated);
}

/**
 * Withdraws the consent and deletes every tracker and entry of the user.
 * The personal workspace and its notes stay; the user deletes those like
 * any other workspace.
 */
export async function withdrawPersonalConsent(
  user: PersonalUser,
  request?: AuditRequestInfo,
): Promise<PersonalStatus> {
  const profile = await prisma.personalProfile.findUnique({ where: { userId: user.id } });
  if (!profile) return statusOf(personalModeAvailable(user.email), null);

  const [entries, trackers] = await prisma.$transaction([
    prisma.trackerEntry.deleteMany({ where: { userId: user.id } }),
    prisma.tracker.deleteMany({ where: { userId: user.id } }),
    prisma.note.updateMany({
      where: { userId: user.id, workspaceId: profile.workspaceId },
      data: { trackersExtractedVersion: null },
    }),
  ]);
  const updated = await prisma.personalProfile.update({
    where: { userId: user.id },
    data: { consentAt: null, consentVersion: null },
  });

  await recordAudit({
    workspaceId: profile.workspaceId,
    actor: user,
    action: "personal.consent_withdrawn",
    metadata: { trackersDeleted: trackers.count, entriesDeleted: entries.count },
    request,
  });
  return statusOf(personalModeAvailable(user.email), updated);
}

/**
 * Tracker routes run only in the user's own personal workspace, with the
 * current consent text accepted.
 */
export async function requireTrackerAccess(
  user: PersonalUser,
  workspaceId: string,
): Promise<void> {
  const profile = await prisma.personalProfile.findUnique({ where: { userId: user.id } });
  if (
    !personalModeAvailable(user.email) ||
    !profile ||
    profile.workspaceId !== workspaceId ||
    !profile.consentAt
  ) {
    throw fail(
      403,
      "Trackers work only in your personal workspace, after you turn on personal mode.",
      "personal_mode_required",
    );
  }
  // A new consent text must be accepted before trackers work again.
  if (profile.consentVersion !== PERSONAL_CONSENT_VERSION) {
    throw fail(409, "Read and accept the new consent text first.", "consent_outdated");
  }
}
