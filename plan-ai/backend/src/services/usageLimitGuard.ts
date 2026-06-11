import prisma from "../prisma/prismaClient";
import { logger } from "../utils/logger";

/**
 * Per-plan allowance config. Maps `TIER:TRACK` to limits per seat per month.
 * BYOK plans are not listed — they have unlimited usage (users pay providers directly).
 * FREE tier is gated by subscriptionGuard (402) before we ever reach here.
 */
export interface PlanAllowance {
  /** Max LLM tokens (input + output) per seat per month. */
  llmTokens: number;
  /** Max recording minutes per seat per month. */
  recordingMinutes: number;
  /** Max doc + slide + diagram generations per seat per month. */
  generations: number;
}

const PLAN_LIMITS: Record<string, PlanAllowance> = {
  "PRO:MANAGED": { llmTokens: 300_000, recordingMinutes: 1_200, generations: 30 },
  "BUSINESS:MANAGED": { llmTokens: 1_000_000, recordingMinutes: 3_600, generations: 100 },
};

/** 10% grace buffer so users aren't cut off mid-operation. */
const GRACE_FACTOR = 1.1;

export type UsageLimitType = "llm" | "recording" | "generation";

export class UsageLimitExceededError extends Error {
  status = 429;
  code = "usage_limit_exceeded" as const;

  constructor(
    public limitType: UsageLimitType,
    public used: number,
    public allowed: number,
  ) {
    super(`Monthly ${limitType} limit exceeded. Used: ${used}, Allowed: ${allowed}.`);
    this.name = "UsageLimitExceededError";
  }
}

/**
 * Get the start of the current billing month (UTC). Uses the 1st of the month
 * for simplicity — Stripe period alignment is a future optimization.
 */
const getCurrentMonthStart = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

/**
 * Resolve the plan allowance for a workspace. Returns null if the workspace
 * is not on a managed plan (BYOK, FREE, courtesy, or no subscription).
 */
const resolveAllowance = async (
  workspaceId: string,
): Promise<{ allowance: PlanAllowance; seats: number } | null> => {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      tier: true,
      subscriptionTrack: true,
      subscriptionSeats: true,
      isCourtesy: true,
    },
  });

  if (!workspace) return null;
  if (workspace.isCourtesy) return null; // courtesy bypasses all limits
  if (workspace.subscriptionTrack !== "MANAGED") return null;

  const key = `${workspace.tier}:${workspace.subscriptionTrack}`;
  const allowance = PLAN_LIMITS[key];
  if (!allowance) return null;

  return { allowance, seats: workspace.subscriptionSeats ?? 1 };
};

/**
 * Query current month's LLM token usage for a workspace.
 */
const getLlmTokenUsage = async (workspaceId: string): Promise<number> => {
  const monthStart = getCurrentMonthStart();
  const result = await prisma.aiUsageLog.aggregate({
    where: {
      workspaceId,
      createdAt: { gte: monthStart },
    },
    _sum: { totalTokens: true },
  });
  return result._sum.totalTokens ?? 0;
};

/**
 * Query current month's total recording minutes for a workspace.
 * Uses `Transcript.durationSeconds` summed and converted to minutes.
 */
const getRecordingMinutesUsage = async (workspaceId: string): Promise<number> => {
  const monthStart = getCurrentMonthStart();
  const result = await prisma.transcript.aggregate({
    where: {
      workspaceId,
      createdAt: { gte: monthStart },
      durationSeconds: { not: null },
    },
    _sum: { durationSeconds: true },
  });
  const totalSeconds = result._sum.durationSeconds ?? 0;
  return Math.ceil(totalSeconds / 60);
};

/**
 * Query current month's total generation count (docs + presentations + diagrams).
 */
const getGenerationCount = async (workspaceId: string): Promise<number> => {
  const monthStart = getCurrentMonthStart();
  const [docs, presentations, diagrams] = await Promise.all([
    prisma.docDocument.count({
      where: { workspaceId, createdAt: { gte: monthStart } },
    }),
    prisma.presentation.count({
      where: { workspaceId, createdAt: { gte: monthStart } },
    }),
    prisma.diagram.count({
      where: { workspaceId, createdAt: { gte: monthStart } },
    }),
  ]);
  return docs + presentations + diagrams;
};

/**
 * Pre-flight usage check. Call this before any AI operation.
 *
 * - For BYOK / FREE / courtesy workspaces: returns immediately (no enforcement).
 * - For MANAGED workspaces: checks current usage against the plan allowance
 *   (with 10% grace buffer). Throws `UsageLimitExceededError` (429) if exceeded.
 */
export const checkUsageLimit = async (
  workspaceId: string,
  limitType: UsageLimitType,
): Promise<void> => {
  const resolved = await resolveAllowance(workspaceId);
  if (!resolved) return; // BYOK / FREE / courtesy — no enforcement

  const { allowance, seats } = resolved;
  let used: number;
  let allowed: number;

  switch (limitType) {
    case "llm":
      used = await getLlmTokenUsage(workspaceId);
      allowed = Math.floor(allowance.llmTokens * seats * GRACE_FACTOR);
      break;
    case "recording":
      used = await getRecordingMinutesUsage(workspaceId);
      allowed = Math.floor(allowance.recordingMinutes * seats * GRACE_FACTOR);
      break;
    case "generation":
      used = await getGenerationCount(workspaceId);
      allowed = Math.floor(allowance.generations * seats * GRACE_FACTOR);
      break;
  }

  if (used >= allowed) {
    logger.info(
      `[usage-limit] Blocking workspace ${workspaceId} — ${limitType} limit exceeded: ${used}/${allowed}`,
    );
    throw new UsageLimitExceededError(limitType, used, allowed);
  }
};

/**
 * Returns the current usage vs. limits for a workspace.
 * Used by the `GET /api/billing/usage-limits` endpoint.
 * Returns null values for limits that are not enforced (BYOK/FREE).
 */
export interface UsageLimitBucket {
  used: number;
  allowed: number;
  percentage: number;
}

export interface UsageLimitsSnapshot {
  llm: UsageLimitBucket | null;
  recording: UsageLimitBucket | null;
  generations: UsageLimitBucket | null;
}

export const getUsageLimits = async (workspaceId: string): Promise<UsageLimitsSnapshot> => {
  const resolved = await resolveAllowance(workspaceId);
  if (!resolved) {
    return { llm: null, recording: null, generations: null };
  }

  const { allowance, seats } = resolved;

  const [llmUsed, recordingUsed, generationUsed] = await Promise.all([
    getLlmTokenUsage(workspaceId),
    getRecordingMinutesUsage(workspaceId),
    getGenerationCount(workspaceId),
  ]);

  const llmAllowed = allowance.llmTokens * seats;
  const recordingAllowed = allowance.recordingMinutes * seats;
  const generationAllowed = allowance.generations * seats;

  return {
    llm: {
      used: llmUsed,
      allowed: llmAllowed,
      percentage: llmAllowed > 0 ? Math.round((llmUsed / llmAllowed) * 100) : 0,
    },
    recording: {
      used: recordingUsed,
      allowed: recordingAllowed,
      percentage: recordingAllowed > 0 ? Math.round((recordingUsed / recordingAllowed) * 100) : 0,
    },
    generations: {
      used: generationUsed,
      allowed: generationAllowed,
      percentage:
        generationAllowed > 0 ? Math.round((generationUsed / generationAllowed) * 100) : 0,
    },
  };
};
