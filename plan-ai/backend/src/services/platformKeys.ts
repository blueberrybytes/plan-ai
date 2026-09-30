import type { SubscriptionStatus, SubscriptionTrack } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import EnvUtils from "../utils/EnvUtils";
import { withDecryptedWorkspaceKeys } from "../utils/workspaceSecrets";
import { ACTIVE_STATUSES } from "./subscriptionGuard";

/**
 * Which AI keys a workspace runs on. A workspace key, when set, always wins.
 * Without one, the platform's keys (DEEPGRAM_API_KEY, OPENROUTER_API_KEY) are
 * used only by courtesy workspaces and by workspaces on a paid MANAGED plan,
 * which is what that plan sells. A BYOK or unpaid workspace gets no platform
 * key, so its usage never lands on our bill.
 */

export interface PlatformKeyFields {
  isCourtesy: boolean;
  subscriptionTrack: SubscriptionTrack | null;
  subscriptionStatus: SubscriptionStatus | null;
}

export const PLATFORM_KEY_SELECT = {
  isCourtesy: true,
  subscriptionTrack: true,
  subscriptionStatus: true,
} as const;

export function usesPlatformKeys(workspace: PlatformKeyFields | null | undefined): boolean {
  if (!workspace) return false;
  if (workspace.isCourtesy) return true;
  return (
    workspace.subscriptionTrack === "MANAGED" &&
    !!workspace.subscriptionStatus &&
    ACTIVE_STATUSES.includes(workspace.subscriptionStatus)
  );
}

// Deepgram keys are 32+ hex characters; anything else is a typo.
const DEEPGRAM_KEY_SHAPE = /^[a-f0-9]{32,}$/i;

/** The Deepgram key for a workspace row whose keys are already decrypted. */
export function deepgramKeyFor(
  workspace: (PlatformKeyFields & { deepgramKey?: string | null }) | null | undefined,
): string | null {
  const own = workspace?.deepgramKey?.trim();
  if (own && DEEPGRAM_KEY_SHAPE.test(own)) return own;
  if (usesPlatformKeys(workspace)) return EnvUtils.get("DEEPGRAM_API_KEY", "") || null;
  return null;
}

/** Loads the workspace and returns its Deepgram key, or null when it has none. */
export async function resolveWorkspaceDeepgramKey(workspaceId: string): Promise<string | null> {
  const workspace = withDecryptedWorkspaceKeys(
    await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { deepgramKey: true, ...PLATFORM_KEY_SELECT },
    }),
  );
  return deepgramKeyFor(workspace);
}
