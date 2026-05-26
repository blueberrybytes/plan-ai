# License — Business Source License 1.1

Plan AI is licensed under the **[Business Source License 1.1 (BUSL-1.1)](https://github.com/blueberrybytes/plan-ai/blob/main/LICENSE)**.

BSL is a "source-available" license used by companies like **Sentry, MariaDB, CockroachDB, Cal.com, and Materialize**. It's stricter than MIT or Apache but more permissive than a closed-source proprietary license — and it has a built-in path to fully open-source.

## What you can do ✅

- **Read, fork, and modify** the source code on GitHub
- **Run Plan AI for your own team's internal business** — record meetings, generate tickets, self-host on your own infrastructure
- **Use it for personal projects**, academic research, or non-profit work
- **Contribute pull requests** back to the upstream repository
- **Self-host the entire stack** under the [self-hosting guide](/self-hosting/docker-deployment) — no licensing fee required for internal use

## What you cannot do ❌

- **Provide a commercial SaaS that competes with Plan AI.** You can't fork the code, rebrand it, and offer "PlanX.io — meeting AI for engineering teams" as a paid product to others.
- **Resell the Licensed Work** as a packaged product, distribution, or hosted offering.
- **Strip or modify license notices.** All copies must preserve the LICENSE file and proprietary notices.
- **Use the Plan AI name, logo, or trademarks** in your own commercial products without written permission.

## The Change Date — 2030-05-01

This is the key thing that makes BSL different from a closed-source license.

> On **May 1, 2030**, the Licensed Work automatically converts to the **GNU Affero General Public License v3.0**.

In plain English: after that date, every line of code in Plan AI becomes fully open source under AGPL terms. The BSL restrictions disappear. Anyone — including direct competitors — can use it however they like as long as they comply with AGPL's copyleft requirements.

This is a deliberate **trust commitment** from Blueberrybytes: the source code you're reading today will be free forever after 2030, even if our company doesn't exist by then.

## Why BSL and not MIT or Apache?

We picked BSL specifically because we wanted to:

1. **Let our customers read every line of code** — engineering teams evaluating Plan AI can see exactly what the recorder does with their audio, how BYOK keys are handled, what the AI prompts contain.
2. **Let our customers self-host** — the Enterprise tier ships with full self-hosting rights, and self-hosting requires source access.
3. **Prevent a well-funded competitor from forking the repo and outspending us on marketing** — which is the failure mode of permissive licenses for small bootstrapped companies.
4. **Guarantee that the code becomes truly free eventually**, regardless of what happens to Blueberrybytes as a business.

If you're an engineering team evaluating Plan AI for your company, BSL gives you everything you need: read the code, self-host it, modify it for your needs. The only thing it stops is someone else turning around and reselling your own copy.

## Commercial licensing

If your use case falls outside the Additional Use Grant — for example, you want to:

- Embed Plan AI in a competing product you sell
- White-label and resell it
- Use it as a hosted service for third parties
- Get custom enterprise terms with a DPA, SOC 2 paperwork, and a procurement-ready contract

…reach out at **[hello@blueberrybytes.com](mailto:hello@blueberrybytes.com?subject=Plan%20AI%20commercial%20license)** and we'll work out a separate commercial agreement.

## The exact license text

The full Business Source License 1.1 text — including the legally binding terms — lives in the [LICENSE file at the repo root](https://github.com/blueberrybytes/plan-ai/blob/main/LICENSE).

::: tip TL;DR for engineering teams
If you're using Plan AI to run your own team's meetings — record them, generate tickets, self-host the whole thing on your AWS account — **you are fully covered by the license, no questions asked**. The restrictions only apply if you try to resell or repackage Plan AI as your own competing product.
:::

## Compared to other licenses

| License | Plan AI uses? | Notes |
|---|---|---|
| **BSL 1.1** | ✅ Yes | Source-available, no competing SaaS, auto-converts to AGPL on 2030-05-01 |
| MIT / Apache 2.0 | ❌ No | Too permissive — would allow a well-funded competitor to fork and outspend us |
| AGPL v3.0 | ⏳ After 2030-05-01 | The Change License — Plan AI becomes pure AGPL automatically |
| PolyForm Noncommercial | ❌ No (we considered it) | Too restrictive — would block our own paying customers from any commercial use |
| Proprietary / closed source | ❌ No | Defeats the trust + self-host story for engineering teams |
