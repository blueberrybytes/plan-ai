import prisma from "../prisma/prismaClient";
import { SubscriptionStatus } from "@prisma/client";
import EnvUtils from "../utils/EnvUtils";
import { logger } from "../utils/logger";

/**
 * Statuses that grant access to paid features. PAST_DUE keeps access for a
 * short grace window (Stripe handles dunning + retries) but UNPAID/CANCELED
 * locks the workspace immediately.
 */
const ACTIVE_STATUSES: SubscriptionStatus[] = ["ACTIVE", "TRIALING", "PAST_DUE"];

export class SubscriptionRequiredError extends Error {
  status = 402; // Payment Required
  code = "subscription_required";

  constructor(
    message = "An active subscription is required to use this feature.",
    public reason:
      | "no_subscription"
      | "expired"
      | "canceled"
      | "incomplete"
      | "over_quota" = "no_subscription",
  ) {
    super(message);
    this.name = "SubscriptionRequiredError";
  }
}

export interface SubscriptionGuardResult {
  active: boolean;
  reason?: "no_subscription" | "expired" | "canceled" | "incomplete" | "over_quota";
  workspaceId: string;
  status: SubscriptionStatus | null;
  tier: string;
}

/**
 * Returns a non-throwing summary of the workspace's billing state. Use this
 * for status endpoints. For enforcement, use `requireActiveSubscription`.
 */
export const checkSubscription = async (workspaceId: string): Promise<SubscriptionGuardResult> => {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      tier: true,
      isCourtesy: true,
      subscriptionStatus: true,
      subscriptionCurrentPeriodEnd: true,
      subscriptionSeats: true,
      _count: {
        select: {
          members: true,
          invitations: {
            where: { status: "PENDING" },
          },
        },
      },
    },
  });

  if (!workspace) {
    return {
      active: false,
      reason: "no_subscription",
      workspaceId,
      status: null,
      tier: "FREE",
    };
  }

  // Courtesy workspaces (internal demos, free comp accounts) bypass billing.
  if (workspace.isCourtesy) {
    return {
      active: true,
      workspaceId,
      status: workspace.subscriptionStatus,
      tier: workspace.tier,
    };
  }

  // Local dev / self-hosted instances without Stripe configured don't
  // enforce subscriptions. This keeps the OSS experience friction-free.
  if (!EnvUtils.get("STRIPE_SECRET_KEY", "")) {
    return {
      active: true,
      workspaceId,
      status: workspace.subscriptionStatus,
      tier: workspace.tier,
    };
  }

  if (!workspace.subscriptionStatus) {
    return {
      active: false,
      reason: "no_subscription",
      workspaceId,
      status: null,
      tier: workspace.tier,
    };
  }

  if (!ACTIVE_STATUSES.includes(workspace.subscriptionStatus)) {
    const reason: SubscriptionGuardResult["reason"] =
      workspace.subscriptionStatus === "CANCELED"
        ? "canceled"
        : workspace.subscriptionStatus === "INCOMPLETE"
          ? "incomplete"
          : "expired";
    return {
      active: false,
      reason,
      workspaceId,
      status: workspace.subscriptionStatus,
      tier: workspace.tier,
    };
  }

  const totalSeats = workspace.subscriptionSeats ?? 1;
  const usedSeats = workspace._count.members + workspace._count.invitations;

  if (usedSeats > totalSeats) {
    return {
      active: false,
      reason: "over_quota",
      workspaceId,
      status: workspace.subscriptionStatus,
      tier: workspace.tier,
    };
  }

  return {
    active: true,
    workspaceId,
    status: workspace.subscriptionStatus,
    tier: workspace.tier,
  };
};

/**
 * Throws SubscriptionRequiredError (HTTP 402) if the workspace doesn't have
 * an active subscription. Use this at the top of controller handlers that
 * trigger paid AI work.
 */
export const requireActiveSubscription = async (workspaceId: string): Promise<void> => {
  const result = await checkSubscription(workspaceId);
  if (!result.active) {
    logger.info(
      `[guard] Blocking workspace ${workspaceId} — subscription ${result.reason ?? "missing"}`,
    );

    let message: string | undefined;
    if (result.reason === "over_quota") {
      message =
        "You have more members than paid seats. Please remove members or upgrade your subscription to continue.";
    }

    throw new SubscriptionRequiredError(message, result.reason);
  }
};
