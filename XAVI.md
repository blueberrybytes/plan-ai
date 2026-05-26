# XAVI — Stripe Setup Action Items 🎯

Hey Xavi — this is the **founder's checklist**. Everything in code is done. These tasks need YOU (only you have Stripe dashboard access).

⏱️ **Total time:** ~45 minutes for test mode, ~1 hour for production launch.

---

## TL;DR — What's already built

✅ Backend Stripe service + webhook handler (`/api/billing/webhook`)
✅ `/api/billing/subscription`, `/api/billing/checkout`, `/api/billing/portal`, `/api/billing/catalog`
✅ **`BaseWorkspaceController.getPaidWorkspaceAccess()`** — single helper used by every paid endpoint (auth + workspace + active subscription required)
✅ Subscription guard on **every paid endpoint** (transcripts, audio chunks, docs, slides, diagrams, context uploads, chat threads + streaming, gitnexus chat, live audio WebSocket)
✅ Subscription guard on **paid workers** (transcript, contextDocument, github) — prevents BullMQ retries from burning credits after a subscription lapses
✅ Frontend `Billing` page at `/billing` with checkout + Stripe Customer Portal links
✅ Subscription banner shown across the app when no active sub (hidden on `/billing` itself)
✅ Banner has **different copy for MEMBER users** (they can't subscribe, ping admin instead)
✅ **402 toast** auto-shown when any API call is blocked by the guard (via baseQuery interceptor)
✅ Onboarding flow lands new workspace creators on `/billing?from=onboarding` with a welcome message
✅ Invited members go straight to `/home` (their workspace is already paid for)
✅ Prisma schema migrated with `stripeCustomerId`, `stripeSubscriptionId`, `subscriptionStatus`, `subscriptionSeats`, `subscriptionTrack`, etc.
✅ `BillingEvent` audit table for webhook idempotency
✅ Self-host friendly: when `STRIPE_SECRET_KEY` is unset, all guards become no-ops

🟡 What YOU need to do is below.

---

## Step 1 — Create a Stripe account (5 min)

Skip if you already have one:

1. Go to https://dashboard.stripe.com/register
2. Use `xavier@blueberrybytes.com` (or your business email)
3. Pick **Spain** as the country, **EUR** as the default currency
4. You can skip business details for now — Stripe lets you test before activating live mode

> 💡 You'll work in **Test mode** (toggle top-left of the dashboard) until you're ready to charge real money. All instructions below assume Test mode.

---

## Step 2 — Create the 4 Products + Prices (15 min)

Go to **Products → Add product**. Do this 4 times, one per tier.

### 2.1 Pro BYOK

| Field | Value |
|---|---|
| **Name** | `Plan AI Pro (BYOK)` |
| **Description** | `Bring your own OpenRouter + Deepgram keys. Perfect for solo founders and small teams.` |
| **Pricing model** | Standard pricing |
| **Price** | `€6.00 EUR` |
| **Billing period** | Monthly |
| **Usage type** | Licensed (per seat) |

After creation, click the price and **copy the Price ID** (starts with `price_…`). You'll need it.

### 2.2 Pro Managed

| Field | Value |
|---|---|
| **Name** | `Plan AI Pro (Managed)` |
| **Description** | `Full managed. We handle keys, transcription, LLM inference, support. Recommended for most teams.` |
| **Price** | `€29.00 EUR` |
| **Billing period** | Monthly |
| **Usage type** | Licensed (per seat) |

Copy the Price ID.

### 2.3 Business BYOK

| Field | Value |
|---|---|
| **Name** | `Plan AI Business (BYOK)` |
| **Description** | `BYOK at scale. For teams 50–500. Lower per-seat cost than Pro.` |
| **Price** | `€14.00 EUR` |
| **Billing period** | Monthly |
| **Usage type** | Licensed (per seat) |

Copy the Price ID.

### 2.4 Business Managed

| Field | Value |
|---|---|
| **Name** | `Plan AI Business (Managed)` |
| **Description** | `Full managed at enterprise scale. Premium support, advanced RAG, audit logs.` |
| **Price** | `€65.00 EUR` |
| **Billing period** | Monthly |
| **Usage type** | Licensed (per seat) |

Copy the Price ID.

---

## Step 3 — Grab your API keys (2 min)

1. Go to **Developers → API keys**
2. Copy the **Secret key** (starts with `sk_test_…` in test mode)
3. Copy the **Publishable key** (starts with `pk_test_…`) — not strictly required yet, but save it for the future Stripe Elements integration

---

## Step 4 — Create the webhook endpoint (5 min)

This is what tells our backend when subscriptions change (new sub, payment failure, cancellation, etc.).

### For local development (with Stripe CLI):

1. Install Stripe CLI: `brew install stripe/stripe-cli/stripe` (macOS) or [download here](https://stripe.com/docs/stripe-cli)
2. Login: `stripe login`
3. Forward events to your local backend:
   ```bash
   stripe listen --forward-to localhost:8080/api/billing/webhook
   ```
4. The CLI prints a **webhook signing secret** (starts with `whsec_…`). Copy it.

### For production (later):

1. Go to **Developers → Webhooks → Add endpoint**
2. **Endpoint URL:** `https://your-backend-url.com/api/billing/webhook`
3. **Events to send** — select these:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Save. Click into the webhook and reveal the **Signing secret** (`whsec_…`). Copy it.

---

## Step 5 — Put the keys in `.env` (3 min)

Open `plan-ai/backend/.env` and fill these in:

```bash
# From Step 3
STRIPE_SECRET_KEY="sk_test_..."

# From Step 4
STRIPE_WEBHOOK_SECRET="whsec_..."

# From Step 2 — replace with your actual Price IDs
STRIPE_PRICE_PRO_BYOK="price_..."
STRIPE_PRICE_PRO_MANAGED="price_..."
STRIPE_PRICE_BUSINESS_BYOK="price_..."
STRIPE_PRICE_BUSINESS_MANAGED="price_..."

# These have sane defaults but make sure APP_URL is correct
APP_URL="http://localhost:3000"
STRIPE_CHECKOUT_SUCCESS_PATH="/billing?status=success"
STRIPE_CHECKOUT_CANCEL_PATH="/billing?status=canceled"
```

> ⚠️ **Important:** Never commit `.env` to git. It's already in `.gitignore`, but double-check.

---

## Step 6 — Run the smoke test (10 min)

This is the critical validation step.

```bash
# Terminal 1
yarn dev

# Terminal 2 — forwards webhooks to localhost
stripe listen --forward-to localhost:8080/api/billing/webhook
```

Then in your browser:

1. Sign in to http://localhost:3000
2. Navigate to **Billing** in the sidebar (or http://localhost:3000/billing)
3. You should see the catalog with 4 plans
4. Click **Subscribe** on Pro BYOK
5. Stripe Checkout opens — use test card `4242 4242 4242 4242`, any future expiry, any CVC, any postcode
6. Click **Subscribe**
7. You'll be redirected to `/billing?status=success`
8. You should see a green "Subscription activated" banner
9. **Current plan: PRO · BYOK** should now show in the page

✅ If you see the current plan card → **everything is wired correctly**.

### Sanity checks to verify:

- The webhook terminal shows `checkout.session.completed` then `customer.subscription.created` arriving and returning **200**.
- In Stripe dashboard, **Customers** shows a new customer with your email and an active subscription.
- In your DB: `SELECT id, name, "subscriptionStatus", tier, "subscriptionTrack" FROM "Workspace";` shows your workspace as `ACTIVE / PRO / BYOK`.

### Negative test:

1. Stripe dashboard → **Customers** → click your subscription → **Cancel subscription** → **Immediately**
2. The webhook fires `customer.subscription.deleted`
3. Refresh the app — you should see the **yellow banner** "Subscription required" at the top
4. Try to create a transcript or open chat — backend should return **402 Payment Required**

If all that passes, you're done with test mode.

---

## Step 7 — Optional: promo code for the influencer push (5 min)

If you're doing the 300k influencer launch and want a discount code:

1. **Coupons → Create coupon**
   - Type: **Percentage discount**
   - Discount: **50%**
   - Duration: **Repeating** → **3 months**
   - Redemption limit: **200** (caps your downside)
2. **Promotion codes → Create promotion code**
   - Coupon: select `LAUNCH50` from above
   - Code: `LAUNCH50` (case-insensitive)
   - Active: Yes
3. Stripe Checkout already shows the "Add promotion code" link because the backend sets `allow_promotion_codes: true`.

Share with the influencer: *"Use code `LAUNCH50` for 50% off your first 3 months of Plan AI Pro Managed."*

---

## Step 8 — Going live (production) — when ready

When you've validated test mode:

1. Top-left of dashboard → toggle to **Live mode**
2. **Repeat Steps 2, 3, 4** in live mode (live mode has a separate set of API keys, products, and webhook endpoints).
3. Activate your Stripe account: **Settings → Activate account** (Stripe will ask for business info, bank account, tax ID).
4. Update production `.env` with the **live** keys (`sk_live_…`, `whsec_…`, `price_…`).
5. Deploy the backend.
6. Smoke test once with a real card on the production app (use your own — you can refund yourself from the dashboard).

---

## What happens after a customer subscribes

1. Customer clicks **Subscribe** → backend creates a Stripe Checkout session → redirect to Stripe
2. Customer pays → Stripe redirects to `/billing?status=success`
3. Stripe sends `checkout.session.completed` → our webhook handler retrieves the subscription and writes `subscriptionStatus=ACTIVE`, `tier=PRO`, `subscriptionTrack=BYOK` to the Workspace row
4. Customer can now use recordings, AI, chat, docs, slides, diagrams
5. Every month Stripe auto-charges; if payment fails, Stripe fires `customer.subscription.updated` with `status=past_due` (we keep access for ~7 days grace per Stripe defaults) then `unpaid` then `canceled` — at which point the banner appears and AI features lock again

---

## What if something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| `STRIPE_SECRET_KEY is not configured` on backend startup | `.env` not loaded | Restart backend after editing `.env` |
| Webhook returns 400 "Invalid signature" | Wrong `STRIPE_WEBHOOK_SECRET` | Re-copy from the Stripe CLI output or dashboard webhook page |
| Subscribed but banner still shows "no subscription" | Webhook didn't fire / wasn't received | Check `stripe listen` terminal, check `BillingEvent` table — should have a row per event |
| Subscribe button does nothing | No `STRIPE_PRICE_*` env vars set | Backend `/api/billing/catalog` returns `{prices: []}` — fill in the price IDs |

---

## Files I touched (so you know what to review if needed)

**Backend:**
- `plan-ai/backend/prisma/schema.prisma` — added `SubscriptionStatus` + `SubscriptionTrack` enums, billing fields on `Workspace`, new `BillingEvent` model
- `plan-ai/backend/src/services/stripeService.ts` — SDK wrapper, checkout, portal, webhook verification, sync logic
- `plan-ai/backend/src/services/subscriptionGuard.ts` — `requireActiveSubscription()` + `SubscriptionRequiredError`
- `plan-ai/backend/src/controller/billingController.ts` — TSOA endpoints + webhook dispatcher
- `plan-ai/backend/src/controller/transcriptsController.ts` — gated `createTranscript` + `createTranscriptFromRecording`
- `plan-ai/backend/src/controller/docController.ts` — gated `create`
- `plan-ai/backend/src/controller/DiagramController.ts` — gated `createDiagram`
- `plan-ai/backend/src/controller/presentationController.ts` — gated `generatePresentation`
- `plan-ai/backend/src/routes/chatRouter.ts` — gated chat stream + assistant stream
- `plan-ai/backend/src/server.ts` — error handler maps `SubscriptionRequiredError` → HTTP 402
- `plan-ai/backend/.env.template` — added Stripe env vars

**Frontend:**
- `plan-ai/frontend/src/store/apis/billingApi.ts` — RTK Query for billing endpoints
- `plan-ai/frontend/src/store/store.ts` + `rootReducers.ts` — wired the new API
- `plan-ai/frontend/src/pages/Billing.tsx` — billing page (catalog + current plan + portal)
- `plan-ai/frontend/src/components/billing/SubscriptionBanner.tsx` — app-wide upgrade banner
- `plan-ai/frontend/src/components/layout/SidebarLayout.tsx` — added Billing nav link + banner mount
- `plan-ai/frontend/src/App.tsx` — added `/billing` route
- `plan-ai/frontend/src/i18n/locales/{en,es}.json` — billing strings + cleaned up duplicate `landingPage` keys
- `plan-ai/frontend/.env.template` — added optional `REACT_APP_STRIPE_PRICE_*` vars (not used yet, reserved for future client-only checkout)

---

## Questions for you (when you're ready)

1. **EUR-only or also USD?** Right now we ship EUR. If you want USD for US customers, we need to create parallel prices in Stripe + the catalog logic needs to detect locale. Tell me when you have a US customer in pipeline.
2. **Annual plans?** Stripe allows it natively — we'd add 4 more Price IDs (`*_ANNUAL`) and let the user pick at checkout. Easy to add, ~30 min of work when needed.
3. **Trial period?** Currently zero free days — they pay on day 1. If you want a 7-day trial for cold leads, add `trial_period_days: 7` in `stripeService.createCheckoutSession`. Tell me if you want this.
4. **What email do you want for `Enterprise contact us`?** Currently `hello@blueberrybytes.com`. Change in `PricingSection.tsx` if different.

---

Done. Ping me when Step 6 passes ✅ and we'll move to commit + PR.
