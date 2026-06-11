# Setting up Stripe Billing (self-hosted)

This page is for **self-hosters** who want to enable subscription billing on their own Plan AI instance. If you're using the managed Plan AI cloud, you don't need this — billing is already configured for you.

::: tip Skip this if…
You're running Plan AI for your own internal team and don't plan to charge anyone. **Leave `STRIPE_SECRET_KEY` unset** — the backend will skip all subscription guards and the app works exactly like before, with no friction. This is the default and recommended OSS setup.
:::

## When to enable Stripe billing

Enable Stripe **only if** you're operating Plan AI as a paid service yourself (e.g. running it for an agency that bills clients, or as a hosted SaaS for your own customers under a commercial license from us — see [License](/about/license)).

When `STRIPE_SECRET_KEY` is configured, the backend enforces:

- **Subscription required** on every paid endpoint (transcripts, docs, slides, diagrams, chat, audio streaming)
- **Per-tier feature gating** based on BYOK vs Managed track
- **Webhook-driven sync** of subscription state from Stripe → workspace DB
- **402 Payment Required** responses surfaced to all three clients (web, recorder, mobile)

## Prerequisites

- Stripe account ([dashboard.stripe.com](https://dashboard.stripe.com))
- Plan AI self-hosted instance running and reachable from the internet (or [Stripe CLI](https://stripe.com/docs/stripe-cli) for local development)
- Access to your backend `.env` file

## Step 1 — Create products in Stripe

In your Stripe Dashboard, create one **product + recurring price** per tier you want to offer:

| Product | Track | Price | Billing |
|---|---|---|---|
| Plan AI Pro (BYOK) | BYOK | €6/seat/month | Monthly, Licensed (per seat) |
| Plan AI Pro (Managed) | Managed | €29/seat/month | Monthly, Licensed (per seat) |
| Plan AI Business (BYOK) | BYOK | €14/seat/month | Monthly, Licensed (per seat) |
| Plan AI Business (Managed) | Managed | €65/seat/month | Monthly, Licensed (per seat) |

You don't need to create all four — only the ones you want to offer. The catalog endpoint (`/api/billing/catalog`) returns whichever price IDs are configured.

Copy each **Price ID** (starts with `price_…`).

## Step 2 — Create a webhook endpoint

Plan AI ships a webhook receiver at `POST /api/billing/webhook`. Stripe sends subscription state changes here.

### For production

1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**
2. **Endpoint URL:** `https://your-plan-ai-host.com/api/billing/webhook`
3. **Events to send:**
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Save, then click into the endpoint and reveal the **Signing secret** (`whsec_…`).

### For local development

```bash
brew install stripe/stripe-cli/stripe
stripe login
stripe listen --forward-to localhost:8080/api/billing/webhook
```

The CLI prints a webhook signing secret on startup — use that.

## Step 3 — Configure env vars

Add these to `plan-ai/backend/.env`:

```bash
# Stripe API keys (Dashboard → Developers → API keys)
STRIPE_SECRET_KEY="sk_test_..."        # or sk_live_... for production
STRIPE_WEBHOOK_SECRET="whsec_..."      # from Step 2

# Price IDs from Step 1 — only include the tiers you offer
STRIPE_PRICE_PRO_BYOK="price_..."
STRIPE_PRICE_PRO_MANAGED="price_..."
STRIPE_PRICE_BUSINESS_BYOK="price_..."
STRIPE_PRICE_BUSINESS_MANAGED="price_..."

# Where Stripe redirects after checkout (relative to APP_URL)
STRIPE_CHECKOUT_SUCCESS_PATH="/billing?status=success"
STRIPE_CHECKOUT_CANCEL_PATH="/billing?status=canceled"
```

Restart the backend after editing.

## Step 4 — Verify

Open the web app at `http://localhost:3000/billing`.

You should see:

- The **price catalog** loaded from your configured Price IDs
- **No "active subscription"** state for the workspace
- The **yellow subscription banner** on top of paid pages (Chat, Slides, Docs, Diagrams, Recordings)

Try a test purchase:

1. Click **Subscribe** on any tier → redirected to Stripe Checkout
2. Pay with test card `4242 4242 4242 4242`, any expiry, any CVC, any postcode
3. Stripe redirects to `/billing?status=success`
4. The page should show **Current Plan: PRO · BYOK** (or whichever tier you chose)
5. In the database: `SELECT id, name, "subscriptionStatus", tier FROM "Workspace";` should show your workspace as `ACTIVE / PRO / BYOK`
6. The yellow banner disappears, AI features unlock

## What happens when a payment fails

Stripe automatically retries failed payments (3 attempts over ~7 days by default).

1. First attempt fails → `invoice.payment_failed` event → backend logs warning
2. Stripe transitions subscription to `past_due` → backend keeps access (grace period)
3. After all retries fail → Stripe transitions to `unpaid` then `canceled` → backend locks paid features

The user sees the **yellow subscription banner** with a "Re-subscribe" CTA, and can update their card via the Stripe Customer Portal (linked from `/billing`).

## Self-host considerations

- **Database:** All billing state lives in `Workspace` table columns (`stripeCustomerId`, `subscriptionStatus`, `subscriptionTrack`, `subscriptionSeats`, `subscriptionCurrentPeriodEnd`) plus a `BillingEvent` table for webhook idempotency. No new infrastructure required.
- **Workers:** All 3 paid background workers (transcript generation, GitHub indexing, context document processing) re-check subscription state at job execution time. If a subscription lapses mid-flight, the worker bails cleanly without burning OpenRouter/Deepgram credit.
- **WebSocket:** The live audio streaming WebSocket (`/api/audio/stream`) checks subscription **before** opening the Deepgram connection — protects against runaway transcription costs.
- **Disabling billing:** Just unset `STRIPE_SECRET_KEY`. The backend reverts to the OSS behavior — all guards become no-ops, all subscription checks return `active: true`, all banners hide on the frontend. No code changes needed.

## Commercial use

::: warning Important — read the license
Operating Plan AI as a paid SaaS that **competes with the Plan AI hosted offering** is **not permitted** under [BSL 1.1](/about/license). If you're running Stripe billing on a self-hosted Plan AI for your own internal team, you're fine. If you're reselling Plan AI as a service to third parties, you need a **commercial license** — reach out at [hello@blueberrybytes.com](mailto:hello@blueberrybytes.com?subject=Plan%20AI%20commercial%20license).
:::

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `STRIPE_SECRET_KEY is not configured` on startup | Backend can't read the env var | Restart backend after editing `.env`; confirm no typos in key name |
| Webhook returns 400 "Invalid signature" | Wrong `STRIPE_WEBHOOK_SECRET` | Re-copy from Stripe CLI output or dashboard webhook page (must match the exact endpoint) |
| User pays but banner still shows "no subscription" | Webhook delayed or failed to reach backend | Verify Stripe CLI / dashboard shows successful 200 deliveries; check the `BillingEvent` table for the event ID |
| `Subscribe` button does nothing | No `STRIPE_PRICE_*` env vars set | Backend `/api/billing/catalog` returns `{prices: []}` — fill in at least one tier's price ID |
| Customer Portal opens but changes don't sync back | Webhook URL not reachable from Stripe | Production webhook URL must be publicly accessible (no localhost) |

## Reference

- [Stripe Dashboard](https://dashboard.stripe.com)
- [Stripe Webhook Events](https://stripe.com/docs/api/events/types)
- [Stripe Test Cards](https://stripe.com/docs/testing)
- [Plan AI BSL License](/about/license)
