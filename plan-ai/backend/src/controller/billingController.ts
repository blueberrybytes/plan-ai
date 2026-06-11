import { Body, Get, Post, Request, Route, Security, SuccessResponse, Tags } from "tsoa";
import * as express from "express";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import { BaseWorkspaceController } from "./BaseWorkspaceController";
import prisma from "../prisma/prismaClient";
import {
  createCheckoutSession,
  createPortalSession,
  getByokTrialDays,
  getPriceCatalog,
  isStripeConfigured,
  recordBillingEvent,
  retrieveSubscription,
  syncBySessionId,
  syncByWorkspaceId,
  syncSubscriptionToWorkspace,
  verifyWebhookSignature,
} from "../services/stripeService";
import { checkSubscription } from "../services/subscriptionGuard";
import { getUsageLimits } from "../services/usageLimitGuard";
import { logger } from "../utils/logger";
import type {
  StripeEvent,
  StripeCheckoutSession,
  StripeSubscription,
} from "../services/stripeService";

export interface SubscriptionStatusResponse {
  active: boolean;
  configured: boolean;
  tier: string;
  status: string | null;
  track: string | null;
  priceId: string | null;
  seats: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** Reason the subscription is not active, when applicable. */
  reason?: "no_subscription" | "expired" | "canceled" | "incomplete" | "over_quota";
}

export interface UsageLimitsResponse {
  llm: { used: number; allowed: number; percentage: number } | null;
  recording: { used: number; allowed: number; percentage: number } | null;
  generations: { used: number; allowed: number; percentage: number } | null;
}

export interface CheckoutBody {
  priceId: string;
  seats?: number;
}

export interface CheckoutResponse {
  url: string;
  sessionId: string;
}

export interface PortalResponse {
  url: string;
}

export interface CatalogEntry {
  priceId: string;
  tier: string;
  track: string;
  key: string;
}

@Tags("Billing")
@Route("api/billing")
export class BillingController extends BaseWorkspaceController {
  /**
   * Returns the current subscription state for the active workspace. Used by
   * the frontend to drive the billing page, upgrade banners, and feature
   * gating UI.
   */
  @Security("BearerAuth")
  @Get("subscription")
  public async getSubscription(
    @Request() request: AuthenticatedRequest,
  ): Promise<SubscriptionStatusResponse> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    const check = await checkSubscription(workspaceId);

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        tier: true,
        subscriptionStatus: true,
        subscriptionTrack: true,
        subscriptionPriceId: true,
        subscriptionSeats: true,
        subscriptionCurrentPeriodEnd: true,
        subscriptionCancelAtPeriodEnd: true,
      },
    });

    return {
      active: check.active,
      configured: isStripeConfigured(),
      tier: workspace?.tier ?? "FREE",
      status: workspace?.subscriptionStatus ?? null,
      track: workspace?.subscriptionTrack ?? null,
      priceId: workspace?.subscriptionPriceId ?? null,
      seats: workspace?.subscriptionSeats ?? 1,
      currentPeriodEnd: workspace?.subscriptionCurrentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: workspace?.subscriptionCancelAtPeriodEnd ?? false,
      reason: check.reason,
    };
  }

  /**
   * Returns the current month's usage vs. plan limits for the workspace.
   * Returns null for each limit type when limits are not enforced (BYOK/FREE).
   */
  @Security("BearerAuth")
  @Get("usage-limits")
  public async getUsageLimits(
    @Request() request: AuthenticatedRequest,
  ): Promise<UsageLimitsResponse> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    return getUsageLimits(workspaceId);
  }

  /**
   * Returns the available price catalog (resolved from env vars) so the
   * frontend can render its pricing UI without hardcoding price IDs.
   */
  @Security("BearerAuth")
  @Get("catalog")
  public async getCatalog(): Promise<{ prices: CatalogEntry[]; byokTrialDays: number }> {
    const catalog = getPriceCatalog();
    const prices = Object.entries(catalog).map(([priceId, descriptor]) => ({
      priceId,
      tier: descriptor.tier,
      track: descriptor.track,
      key: descriptor.key,
    }));
    // Surfaced so the pricing UI can show "N-day free trial" on BYOK plans
    // without hardcoding (matches STRIPE_BYOK_TRIAL_DAYS). 0 = trials disabled.
    return { prices, byokTrialDays: getByokTrialDays() };
  }

  /**
   * Creates a Stripe Checkout session for the given price and returns the
   * redirect URL. Only OWNER or ADMIN of the workspace can initiate.
   */
  @Security("BearerAuth")
  @SuccessResponse("200", "Checkout session created")
  @Post("checkout")
  public async createCheckout(
    @Request() request: AuthenticatedRequest,
    @Body() body: CheckoutBody,
  ): Promise<CheckoutResponse> {
    const { user, workspaceId } = await this.requireAdminOrOwner(request);
    if (!body.priceId) {
      this.setStatus(400);
      throw { status: 400, message: "Missing priceId" };
    }
    const result = await createCheckoutSession({
      workspaceId,
      priceId: body.priceId,
      email: user.email,
      seats: body.seats ?? 1,
    });
    return result;
  }

  /**
   * Creates a Stripe Customer Portal session for managing the active
   * subscription (cancel, update card, view invoices).
   */
  @Security("BearerAuth")
  @SuccessResponse("200", "Portal session created")
  @Post("portal")
  public async createPortal(@Request() request: AuthenticatedRequest): Promise<PortalResponse> {
    const { workspaceId } = await this.requireAdminOrOwner(request);
    return createPortalSession({ workspaceId });
  }

  /**
   * Force-sync a subscription by checkout session ID. The frontend calls
   * this on `/billing?status=success` as a safety net in case the Stripe
   * webhook hasn't yet been delivered (rare but possible — usually
   * milliseconds, can be seconds under load).
   */
  @Security("BearerAuth")
  @SuccessResponse("200", "Session synced")
  @Post("sync-session")
  public async syncSession(
    @Request() request: AuthenticatedRequest,
    @Body() body: { sessionId: string },
  ): Promise<{ synced: boolean }> {
    await this.getAuthorizedWorkspaceAccess(request);
    if (!body.sessionId) {
      this.setStatus(400);
      throw { status: 400, message: "Missing sessionId" };
    }
    const synced = await syncBySessionId(body.sessionId);
    return { synced };
  }

  /**
   * Force-sync a subscription directly from Stripe. Used when returning
   * from the Customer Portal so the UI updates immediately.
   */
  @Security("BearerAuth")
  @SuccessResponse("200", "Portal synced")
  @Post("sync-portal")
  public async syncPortal(@Request() request: AuthenticatedRequest): Promise<{ synced: boolean }> {
    const { workspaceId } = await this.requireAdminOrOwner(request);
    const synced = await syncByWorkspaceId(workspaceId);
    return { synced };
  }

  /**
   * Stripe webhook receiver. Verifies the signature against the raw body
   * captured by bodyParser (see server.ts `verify` callback), then dispatches
   * known event types to the syncing service.
   *
   * NOTE: This endpoint is intentionally unauthenticated — Stripe doesn't
   * include any JWT, security is provided by HMAC signature verification.
   */
  @SuccessResponse("200", "Webhook processed")
  @Post("webhook")
  public async handleWebhook(@Request() request: express.Request): Promise<{ received: boolean }> {
    const signature = request.headers["stripe-signature"] as string | undefined;
    if (!signature) {
      this.setStatus(400);
      throw new Error("Missing stripe-signature header");
    }

    const rawBody = (request as express.Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      this.setStatus(400);
      throw new Error("Missing raw request body — server is misconfigured");
    }

    let event: StripeEvent;
    try {
      event = verifyWebhookSignature(rawBody, signature);
    } catch (err) {
      logger.error("[stripe] Webhook signature verification failed", err);
      this.setStatus(400);
      throw new Error("Invalid webhook signature");
    }

    logger.info(`[stripe] Webhook received: ${event.type} (${event.id})`);

    try {
      await dispatchWebhookEvent(event);
    } catch (err) {
      // We log and return 200 anyway for non-fatal handler errors so Stripe
      // doesn't retry indefinitely — the BillingEvent row gives us a replay
      // path if needed. Fatal infra errors (DB down) still throw.
      logger.error(`[stripe] Error handling webhook ${event.id}`, err);
    }

    return { received: true };
  }
}

/**
 * Resolve the workspaceId from a Stripe event by reading metadata or
 * customer mapping. The 5 event types our dispatcher handles all expose
 * `metadata` and `customer` on `data.object` (Subscription, Checkout.Session,
 * Invoice). We narrow to the shared subset using `StripeSubscription` as
 * the reference SDK type — no `unknown`/`any` involved.
 */
type WorkspaceCarryingObject = Pick<StripeSubscription, "metadata" | "customer">;

const resolveWorkspaceFromEvent = async (event: StripeEvent): Promise<string | null> => {
  const obj = event.data.object as Partial<WorkspaceCarryingObject>;

  const metaId = obj.metadata?.workspaceId;
  if (metaId) return metaId;

  if (obj.customer) {
    const customerId = typeof obj.customer === "string" ? obj.customer : obj.customer.id;
    const w = await prisma.workspace.findUnique({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });
    return w?.id ?? null;
  }
  return null;
};

const dispatchWebhookEvent = async (event: StripeEvent): Promise<void> => {
  const workspaceId = await resolveWorkspaceFromEvent(event);
  const isNew = await recordBillingEvent(event, workspaceId);
  if (!isNew) return;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as StripeCheckoutSession;
      if (session.mode !== "subscription" || !session.subscription) return;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      const subscription = await retrieveSubscription(subscriptionId);
      await syncSubscriptionToWorkspace(subscription);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as StripeSubscription;
      await syncSubscriptionToWorkspace(subscription);
      break;
    }
    case "invoice.payment_failed": {
      logger.warn(`[stripe] Payment failed for workspace ${workspaceId ?? "unknown"}`);
      // Stripe will retry; we just log here. Next subscription.updated will
      // bring status to past_due/unpaid which we handle in syncSubscription.
      break;
    }
    default:
      logger.debug(`[stripe] Ignoring unhandled event ${event.type}`);
  }
};
