import Stripe, { API_VERSION } from "stripe";

/**
 * Stripe SDK type derivations.
 *
 * Default-imported `Stripe` exposes the class but TS doesn't merge the
 * namespace through the default import — `Stripe.Subscription` resolves to
 * `StripeConstructor.Subscription` which doesn't exist. We instead derive
 * the resource types from the client's method signatures, then strip the
 * `Response<T>` wrapper (`{ lastResponse: ... }`) so the types match both
 * direct-API returns and expanded sub-objects on Checkout sessions.
 */
export type StripeClient = InstanceType<typeof Stripe>;
export type StripeEvent = Omit<
  ReturnType<StripeClient["webhooks"]["constructEvent"]>,
  "lastResponse"
>;
export type StripeSubscription = Omit<
  Awaited<ReturnType<StripeClient["subscriptions"]["retrieve"]>>,
  "lastResponse"
>;
export type StripeSubscriptionItem = StripeSubscription["items"]["data"][number];
export type StripeCheckoutSession = Omit<
  Awaited<ReturnType<StripeClient["checkout"]["sessions"]["create"]>>,
  "lastResponse"
>;
export type StripeEventDataObject = StripeEvent["data"]["object"];
import EnvUtils from "../utils/EnvUtils";
import { logger } from "../utils/logger";
import prisma from "../prisma/prismaClient";
import { SubscriptionStatus, SubscriptionTrack, WorkspaceTier, Prisma } from "@prisma/client";

/**
 * Lazy Stripe SDK accessor. We don't initialize at module load because tests
 * and local dev sometimes run without the key configured — the service should
 * only fail when actually used.
 */
let stripeClient: StripeClient | null = null;
const getStripe = (): StripeClient => {
  if (stripeClient) return stripeClient;
  const key = EnvUtils.get("STRIPE_SECRET_KEY", "");
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  stripeClient = new Stripe(key, {
    apiVersion: API_VERSION,
    typescript: true,
    appInfo: { name: "Plan AI", version: "1.0.0" },
  });
  return stripeClient;
};

export const isStripeConfigured = (): boolean => {
  return Boolean(EnvUtils.get("STRIPE_SECRET_KEY", ""));
};

/**
 * Map a Stripe price ID to internal tier + track. The mapping is driven by
 * environment variables so adding new tiers or switching test/live price IDs
 * doesn't require a code change.
 */
export interface TierDescriptor {
  tier: WorkspaceTier;
  track: SubscriptionTrack;
  /** Display key used in i18n (e.g. "proByok"). */
  key: string;
}

export const getPriceCatalog = (): Record<string, TierDescriptor> => {
  const catalog: Record<string, TierDescriptor> = {};
  const proByok = EnvUtils.get("STRIPE_PRICE_PRO_BYOK", "");
  const proManaged = EnvUtils.get("STRIPE_PRICE_PRO_MANAGED", "");
  const businessByok = EnvUtils.get("STRIPE_PRICE_BUSINESS_BYOK", "");
  const businessManaged = EnvUtils.get("STRIPE_PRICE_BUSINESS_MANAGED", "");
  if (proByok) catalog[proByok] = { tier: "PRO", track: "BYOK", key: "proByok" };
  if (proManaged) catalog[proManaged] = { tier: "PRO", track: "MANAGED", key: "proManaged" };
  if (businessByok)
    catalog[businessByok] = { tier: "BUSINESS", track: "BYOK", key: "businessByok" };
  if (businessManaged)
    catalog[businessManaged] = { tier: "BUSINESS", track: "MANAGED", key: "businessManaged" };
  return catalog;
};

export const resolveTierFromPrice = (priceId: string | null | undefined): TierDescriptor | null => {
  if (!priceId) return null;
  return getPriceCatalog()[priceId] ?? null;
};

/**
 * Find or create a Stripe Customer for a workspace. Idempotent — re-uses the
 * customerId stored on the workspace when present.
 */
export const ensureStripeCustomer = async (workspaceId: string, email: string): Promise<string> => {
  const stripe = getStripe();
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  if (workspace.stripeCustomerId) {
    return workspace.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email,
    name: workspace.name,
    metadata: {
      workspaceId,
    },
  });

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
};

/**
 * Create a Stripe Checkout Session for the given workspace + price. Returns
 * the URL the frontend should redirect to. The session is tagged with the
 * workspaceId so the webhook can correlate the payment back without
 * relying on the email match.
 */
export const createCheckoutSession = async (params: {
  workspaceId: string;
  priceId: string;
  email: string;
  seats?: number;
}): Promise<{ url: string; sessionId: string }> => {
  const stripe = getStripe();
  const { workspaceId, priceId, email, seats = 1 } = params;

  const catalog = getPriceCatalog();
  if (!catalog[priceId]) {
    throw new Error(`Price ID ${priceId} not found in catalog. Check STRIPE_PRICE_* env vars.`);
  }

  const customerId = await ensureStripeCustomer(workspaceId, email);
  const appUrl = EnvUtils.get("APP_URL", "http://localhost:3000");
  const successPath = EnvUtils.get("STRIPE_CHECKOUT_SUCCESS_PATH", "/billing?status=success");
  const cancelPath = EnvUtils.get("STRIPE_CHECKOUT_CANCEL_PATH", "/billing?status=canceled");

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: seats }],
    client_reference_id: workspaceId,
    success_url: `${appUrl}${successPath}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}${cancelPath}`,
    subscription_data: {
      metadata: { workspaceId },
    },
    metadata: { workspaceId },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
  });

  if (!session.url) {
    throw new Error("Stripe Checkout did not return a URL");
  }

  return { url: session.url, sessionId: session.id };
};

/**
 * Create a Stripe Customer Portal session so the user can manage their
 * subscription (cancel, update card, etc.) without us re-building those flows.
 */
export const createPortalSession = async (params: {
  workspaceId: string;
}): Promise<{ url: string }> => {
  const stripe = getStripe();
  const workspace = await prisma.workspace.findUnique({ where: { id: params.workspaceId } });
  if (!workspace) throw new Error(`Workspace ${params.workspaceId} not found`);
  if (!workspace.stripeCustomerId) {
    throw new Error("Workspace has no Stripe customer. Subscribe first via checkout.");
  }
  const appUrl = EnvUtils.get("APP_URL", "http://localhost:3000");
  const session = await stripe.billingPortal.sessions.create({
    customer: workspace.stripeCustomerId,
    return_url: `${appUrl}/billing?status=portal_return`,
  });
  return { url: session.url };
};

const mapStripeStatus = (status: StripeSubscription['status']): SubscriptionStatus => {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    case "unpaid":
      return "UNPAID";
    case "paused":
      return "PAUSED";
    case "incomplete":
    case "incomplete_expired":
    default:
      return "INCOMPLETE";
  }
};

/**
 * Sync a Stripe subscription's state into the Workspace row. Called from
 * webhook handlers and on-demand reconciliation.
 */
export const syncSubscriptionToWorkspace = async (
  subscription: StripeSubscription,
): Promise<void> => {
  // Resolve workspaceId from metadata, falling back to the customer's
  // mapping if metadata was lost (e.g. for legacy subs).
  const metadataWorkspaceId = (subscription.metadata?.workspaceId as string | undefined) ?? null;

  let workspaceId = metadataWorkspaceId;
  if (!workspaceId) {
    const customerId =
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const workspace = await prisma.workspace.findUnique({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });
    workspaceId = workspace?.id ?? null;
  }

  if (!workspaceId) {
    logger.warn(
      `[stripe] Cannot sync subscription ${subscription.id} — no workspace mapping found.`,
    );
    return;
  }

  const item: StripeSubscriptionItem | undefined = subscription.items.data[0];
  const priceId = item?.price?.id ?? null;
  const seats = item?.quantity ?? 1;
  const descriptor = resolveTierFromPrice(priceId);
  // `current_period_end` lives on the SubscriptionItem in the current Stripe
  // API version (multi-product subscription model) — typed directly by the SDK.
  const currentPeriodEnd: number | null = item?.current_period_end ?? null;

  const data: Prisma.WorkspaceUpdateInput = {
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: mapStripeStatus(subscription.status),
    subscriptionPriceId: priceId,
    subscriptionSeats: seats,
    subscriptionCurrentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
    subscriptionCancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
  };

  if (descriptor) {
    data.tier = descriptor.tier;
    data.subscriptionTrack = descriptor.track;
  }

  // Downgrade tier to FREE when subscription ends.
  if (subscription.status === "canceled" || subscription.status === "unpaid") {
    data.tier = "FREE";
  }

  await prisma.workspace.update({
    where: { id: workspaceId },
    data,
  });

  logger.info(
    `[stripe] Synced subscription ${subscription.id} (${subscription.status}) → workspace ${workspaceId}`,
  );
};

/**
 * Verify and parse an incoming Stripe webhook event. Throws if the signature
 * doesn't match the configured webhook secret — Stripe requires raw body.
 */
export const verifyWebhookSignature = (rawBody: Buffer, signatureHeader: string): StripeEvent => {
  const stripe = getStripe();
  const secret = EnvUtils.get("STRIPE_WEBHOOK_SECRET", "");
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  return stripe.webhooks.constructEvent(rawBody, signatureHeader, secret);
};

/**
 * Retrieve a subscription directly from Stripe (used during checkout
 * confirmation when the subscription may not yet be in our DB).
 */
export const retrieveSubscription = async (
  subscriptionId: string,
): Promise<StripeSubscription> => {
  const stripe = getStripe();
  return stripe.subscriptions.retrieve(subscriptionId);
};

/**
 * Force a subscription sync by checkout session ID. Used as a fallback on
 * the `/billing?status=success` page in case the webhook hasn't reached us
 * before the user's browser landed back. Retrieves the session from Stripe,
 * then the subscription, then writes the workspace row.
 */
export const syncBySessionId = async (sessionId: string): Promise<boolean> => {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });
  if (!session.subscription) {
    logger.warn(`[stripe] Session ${sessionId} has no subscription to sync`);
    return false;
  }
  // After the null guard above, `session.subscription` is narrowed to
  // `string | StripeSubscription` (deleted-customer is impossible here
  // because we expanded the subscription). Resolve both branches via
  // the typed SDK without further casts.
  const subscription: StripeSubscription =
    typeof session.subscription === "string"
      ? await retrieveSubscription(session.subscription)
      : session.subscription;
  await syncSubscriptionToWorkspace(subscription);
  return true;
};

/**
 * Force a subscription sync by workspace ID. Used as a fallback on
 * the `/billing?status=portal_return` page. Retrieves the latest active
 * subscription for the customer from Stripe, then writes the workspace row.
 */
export const syncByWorkspaceId = async (workspaceId: string): Promise<boolean> => {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace || !workspace.stripeCustomerId) return false;

  const stripe = getStripe();
  const subscriptions = await stripe.subscriptions.list({
    customer: workspace.stripeCustomerId,
    status: "active",
    limit: 1,
  });

  if (subscriptions.data.length === 0) {
    // Also check trialing just in case
    const trialing = await stripe.subscriptions.list({
      customer: workspace.stripeCustomerId,
      status: "trialing",
      limit: 1,
    });
    if (trialing.data.length > 0) {
      await syncSubscriptionToWorkspace(trialing.data[0]);
      return true;
    }
    return false;
  }

  await syncSubscriptionToWorkspace(subscriptions.data[0]);
  return true;
};

/**
 * Record a billing event for audit + idempotency. Returns true if this event
 * was new (and should be processed), false if we've already seen it.
 */
export const recordBillingEvent = async (
  event: StripeEvent,
  workspaceId: string | null,
): Promise<boolean> => {
  if (!workspaceId) return true; // can't dedupe without workspace; process anyway
  // Stripe event objects come from JSON over the wire and are always
  // JSON-serializable. Round-trip through JSON to convert the SDK's typed
  // object into Prisma's `InputJsonValue` shape with zero `unknown`/`any`.
  const payload: Prisma.InputJsonValue = JSON.parse(JSON.stringify(event.data.object));
  try {
    await prisma.billingEvent.create({
      data: {
        workspaceId,
        stripeEventId: event.id,
        eventType: event.type,
        payload,
      },
    });
    return true;
  } catch (err) {
    // Unique constraint violation = duplicate event, skip processing.
    if ((err as { code?: string }).code === "P2002") {
      logger.info(`[stripe] Skipping duplicate event ${event.id}`);
      return false;
    }
    throw err;
  }
};
