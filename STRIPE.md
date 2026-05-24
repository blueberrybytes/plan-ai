# Stripe Payment Links Setup — Plan AI Pricing

## Overview

Plan AI pricing has **two tracks**: BYOK (Bring Your Own Keys) and Managed. Users pay per-seat per-month. This document outlines the Stripe Payment Links you need to create and where to integrate them.

## Pricing Tiers

| Tier           | Track   | Price          | Seats  | Billing             | Target                          |
| -------------- | ------- | -------------- | ------ | ------------------- | ------------------------------- |
| **Pro**        | BYOK    | €6/seat/month  | 1–50   | Monthly             | Solo founders, small teams      |
| **Pro**        | Managed | €29/seat/month | 1–50   | Monthly             | Most teams (default upsell)     |
| **Business**   | BYOK    | €14/seat/month | 50–500 | Annual (negotiable) | Larger teams, cost-conscious    |
| **Business**   | Managed | €65/seat/month | 50–500 | Annual (negotiable) | Enterprise-adjacent, compliance |
| **Enterprise** | —       | Custom         | 500+   | Annual              | Self-host, SOC 2, custom SLA    |

---

## Tasks

### 1. Create Stripe Payment Links (Stripe Dashboard)

**Location:** https://dashboard.stripe.com → **Payments** → **Payment Links** → **Create**

For each of the 4 paid tiers, create a **Recurring Payment Link** (not one-time). Stripe will handle the monthly/annual billing automation.

#### 1.1 Pro BYOK — €6/seat/month

**Name in Stripe:** `Plan AI - Pro BYOK`

**Configure:**

- **Product Name:** `Plan AI Pro (BYOK)`
- **Price:** €6.00
- **Billing Period:** Monthly
- **Currency:** EUR
- **Description:** "Bring your own OpenRouter + Deepgram keys. Perfect for solo founders and small teams."

**After Link is Created:**

- Copy the **Payment Link URL** (e.g., `https://buy.stripe.com/aEU...`)
- Store in `.env` as `VITE_STRIPE_PRO_BYOK_LINK=<URL>`

---

#### 1.2 Pro Managed — €29/seat/month

**Name in Stripe:** `Plan AI - Pro Managed`

**Configure:**

- **Product Name:** `Plan AI Pro (Managed)`
- **Price:** €29.00
- **Billing Period:** Monthly
- **Currency:** EUR
- **Description:** "Full managed. We handle keys, transcription, LLM inference, support. Recommended for most teams."

**After Link is Created:**

- Copy the **Payment Link URL**
- Store in `.env` as `VITE_STRIPE_PRO_MANAGED_LINK=<URL>`

**Note:** This is the **default upsell**. Highlight it in the UI with "Most teams pick this" badge (already in code at `PricingSection.tsx`).

---

#### 1.3 Business BYOK — €14/seat/month

**Name in Stripe:** `Plan AI - Business BYOK`

**Configure:**

- **Product Name:** `Plan AI Business (BYOK)`
- **Price:** €14.00
- **Billing Period:** Monthly or Annual (Stripe allows customer to choose at checkout)
- **Currency:** EUR
- **Description:** "BYOK at scale. For teams 50–500. Lower per-seat cost than Pro."

**After Link is Created:**

- Copy the **Payment Link URL**
- Store in `.env` as `VITE_STRIPE_BUSINESS_BYOK_LINK=<URL>`

---

#### 1.4 Business Managed — €65/seat/month

**Name in Stripe:** `Plan AI - Business Managed`

**Configure:**

- **Product Name:** `Plan AI Business (Managed)`
- **Price:** €65.00
- **Billing Period:** Monthly or Annual
- **Currency:** EUR
- **Description:** "Full managed at enterprise scale. Premium support, advanced RAG, audit logs."

**After Link is Created:**

- Copy the **Payment Link URL**
- Store in `.env` as `VITE_STRIPE_BUSINESS_MANAGED_LINK=<URL>`

---

### 2. Update Code with Payment Link URLs

**File:** `/plan-ai/frontend/src/components/landing/PricingSection.tsx`

**Locations to update:**

```tsx
// Line ~19-20: Replace placeholder URLs
const TIERS = [
  {
    name: "Pro",
    subtitle: "For small teams",
    track: "BYOK",
    price: 6,
    currency: "€",
    period: "/month/seat",
    cta: "Start Free Trial",
    ctaLink: "/signup", // ← Free tier, no link change needed
    highlighted: false,
  },
  {
    name: "Pro",
    subtitle: "Most teams pick this",
    track: "Managed",
    price: 29,
    currency: "€",
    period: "/month/seat",
    cta: "Subscribe",
    ctaLink: "https://buy.stripe.com/REPLACE_PRO_MANAGED", // ← REPLACE WITH STRIPE URL
    highlighted: true,
  },
  {
    name: "Business",
    subtitle: "For scaling teams",
    track: "BYOK",
    price: 14,
    currency: "€",
    period: "/month/seat",
    cta: "Subscribe",
    ctaLink: "https://buy.stripe.com/REPLACE_BUSINESS_BYOK", // ← REPLACE WITH STRIPE URL
    highlighted: false,
  },
  {
    name: "Business",
    subtitle: "Premium managed",
    track: "Managed",
    price: 65,
    currency: "€",
    period: "/month/seat",
    cta: "Subscribe",
    ctaLink: "https://buy.stripe.com/REPLACE_BUSINESS_MANAGED", // ← REPLACE WITH STRIPE URL
    highlighted: false,
  },
];
```

**Steps:**

1. Open the file in your editor
2. Find each `ctaLink: 'https://buy.stripe.com/REPLACE_*'`
3. Replace with the actual Stripe Payment Link URL from Step 1
4. Save the file

---

### 3. (Optional) Create Promo Code in Stripe

**For the influencer push**, create a reusable promo code to offer a discount.

**Example:** `LAUNCH50` (50% off first 3 months, max 200 redemptions)

**Steps:**

1. Stripe Dashboard → **Billing** → **Coupons** → **Create Coupon**
2. **Coupon type:** Percentage discount
3. **Discount:** 50%
4. **Applies to:** All recurring prices (or select specific ones)
5. **Duration:** Limited (3 months)
6. **Redemption limit:** 200
7. **Name:** `LAUNCH50`

**Then**, share the code with the influencer:

- _"Use code `LAUNCH50` for 50% off your first 3 months of Plan AI Pro Managed"_

---

### 4. Environment File (.env)

Add these to **all three frontend `.env` files**:

- `plan-ai/frontend/.env`
- `plan-ai-recorder/.env` (if needed for future linking)
- `plan-ai-mobile/.env` (if needed for future linking)

```bash
VITE_STRIPE_PRO_BYOK_LINK=https://buy.stripe.com/...
VITE_STRIPE_PRO_MANAGED_LINK=https://buy.stripe.com/...
VITE_STRIPE_BUSINESS_BYOK_LINK=https://buy.stripe.com/...
VITE_STRIPE_BUSINESS_MANAGED_LINK=https://buy.stripe.com/...
```

**Note:** Currently only the web frontend uses these, but keeping them in all `.env.template` files ensures consistency across the monorepo.

---

## Testing Checklist

- [ ] All 4 Stripe Payment Links created
- [ ] URLs copied and updated in `PricingSection.tsx`
- [ ] `yarn dev` runs without errors
- [ ] Navigate to landing page → scroll to Pricing section
- [ ] Click each "Subscribe" CTA → verify it opens Stripe Checkout
- [ ] Stripe Checkout shows correct price, currency (EUR), and product name
- [ ] Complete a test transaction (use Stripe test card `4242 4242 4242 4242`)
- [ ] Verify subscription appears in Stripe Dashboard under **Customers**
- [ ] (Optional) Test promo code in Stripe Checkout

---

## Reference Links

- **Stripe Dashboard:** https://dashboard.stripe.com
- **Payment Links Docs:** https://stripe.com/docs/payments/payment-links
- **Test Cards:** https://stripe.com/docs/testing

---

## Notes

1. **Billing Cycle:** All links use Stripe's automatic billing. On day 1 of each month, Stripe charges the customer's card automatically.

2. **Failed Payments:** Stripe will retry failed payments 3 times over 3 days. After that, the subscription is paused. We'll need backend logic to handle `invoice.payment_failed` webhooks, but that's out of scope for this task.

3. **Seat Counting:** The current UI doesn't enforce seat limits per tier (e.g., Pro maxes out at 50 seats). This is a **future enhancement**. For now, users can buy as many seats as they want at the tier price.

4. **Annual Billing:** Business tiers allow both monthly and annual. Stripe handles this at checkout. We don't need separate links.

5. **Currency:** All prices are in EUR (€). If you want to add USD pricing later, you'll need separate links per currency.

---

## Timeline

- **Creation:** 30 minutes (4 links in Stripe Dashboard)
- **Code update:** 5 minutes (replace 4 URLs in `PricingSection.tsx`)
- **Testing:** 15 minutes (run locally, test 1 checkout flow)
- **Total:** ~1 hour

---

## Owner

**Xavier (Founder)** — Only person with Stripe Dashboard access. You'll need to create the links yourself or grant team member access to Stripe.

Once links are created and URLs are in code, the frontend is ready for traffic.
