# Who is Plan AI for?

Plan AI is **purpose-built for software teams**. If you're not writing code, reviewing code, or managing people who write code, this probably isn't the tool for you — and that's intentional. Every design decision in Plan AI assumes the people in the room talk about files, tickets, deploys, and architectures.

This page is the most important page in the docs. Read it before everything else. If your team isn't on the "Built for" list, save yourself time and use a different tool — we'll recommend one below.

## ✅ Built for

### Software agencies & consultancies

You bill clients hourly. Every hour your senior engineer spends transcribing a discovery call or writing acceptance criteria is **unbilled time** — Plan AI buys it back. Auto-generated client-ready specs and Jira tickets come out of the same recording.

**Typical team shape:** 5–80 people, mostly engineers + designers + PMs. Mix of fixed-fee and T&M projects. Stack varies per client but Jira / Linear / Notion / GitHub are nearly universal.

**ROI math:** 4 hours/week saved × €120/hour × 12 engineers ≈ **€23k/month value** at €29/seat managed pricing. Payback in week one.

### Product engineering teams at startups & scale-ups

You run standups, design reviews, sprint planning, retros, customer-discovery calls. The artifacts decay — half-written tickets, screenshots in Slack, no one's sure what was actually decided. Plan AI replaces the EM's Friday afternoon of "writing things down so nobody forgets" with a 90-second background process.

**Typical team shape:** 10–60 engineers in a wider product org. Series A–C funding. Already using Linear / Jira, GitHub, sometimes Notion.

**Why it works:** Engineering teams already invest in dev productivity tools (Cursor, Copilot, Sentry, Linear). Plan AI fits the same buyer mental model and the same budget line.

### In-house engineering at non-tech-first companies

Banks, retailers, healthtech, gov-tech, anywhere with compliance + audit pressure where meetings *must* produce written artifacts. Currently a junior writes the minutes by hand. Plan AI replaces that role for a fraction of the cost — and the minutes are higher quality because they're code-aware.

**Typical team shape:** 20–500 engineers in squads of 5–15. Long sales cycle, but big seat counts.

::: tip Enterprise note
SOC 2, SSO, audit logs, and on-prem deployment are on the [enterprise tier](/getting-started/introduction#pricing). Talk to us if you need procurement-ready paperwork.
:::

## ❌ Not built for

Be honest with yourself — if your team falls into any of these buckets, **another tool will serve you better and we'll happily recommend one**.

| Use case | Why Plan AI is wrong for it | What to use instead |
|---|---|---|
| **Sales discovery + closing calls** | Plan AI's value compounds with code. Without code, you're paying for capabilities you don't use. | [Fathom](https://fathom.video/), [Gong](https://www.gong.io/), [Chorus](https://www.chorus.ai/) |
| **Customer success / QBRs** | Same as above — the code-aware features don't apply. | [Fathom](https://fathom.video/), [Otter](https://otter.ai/) |
| **Recruiting / hiring interviews** | Recording legality + the "this is being evaluated" social dynamic. | [Metaview](https://www.metaview.ai/), [BrightHire](https://brighthire.com/) |
| **Marketing strategy meetings** | No technical context to extract. Generic summaries are commodity. | [Granola](https://granola.ai/), [Fireflies](https://fireflies.ai/) |
| **Board meetings, all-hands, town halls** | The output (formal minutes, action items) doesn't map to engineering tickets. | [Otter](https://otter.ai/), human notetaker |
| **Personal note-taking, journaling** | Plan AI assumes a team workspace. Solo prosumer flow is not the target. | [Granola](https://granola.ai/) (Mac), [Apple Notes voice memos] |

## The "I'm tired of writing tickets from memory" test

If you've ever said any of these out loud:

> *"We discussed this in standup, then nobody wrote it down."*
>
> *"What did we decide in the design review last week?"*
>
> *"I spent my Friday rewriting tickets from Slack threads."*
>
> *"The client asked for X in the call and now there's no record."*
>
> *"Why does it take 4 hours to write specs from a 1-hour meeting?"*

… you're our ICP. The product is built to eliminate exactly these moments.

## How Plan AI differs from Fathom / Otter / Fireflies

Other meeting tools record and summarize **horizontally** — every meeting type, every industry. Plan AI is **vertical**: it makes one type of meeting (engineering conversations) 10× more valuable, and ignores the rest.

The single biggest differentiator: **code awareness via GitNexus.** Before Plan AI writes a ticket, it queries the code graph for the relevant symbols, files, and execution flows. The output references real code, not hallucinated method names. No other meeting tool does this.

See [the GitNexus feature page](/features/gitnexus) for technical details.

## Three buyer personas

We've written marketing copy that targets these three explicitly. If you recognize yourself, [start with the relevant onboarding](/getting-started/quickstart).

**1. The agency founder / CTO** — Maria, 32, runs a 15-person React Native consultancy. Bills clients €120–180/hour. Hates writing specs on Fridays. Already uses Linear + GitHub + Notion. **Wins immediately because the ROI math is obvious.**

**2. The engineering manager** — James, 36, manages 3 squads at a 40-engineer Series B. Spends ~5h/week on "writing things down so people don't forget". Wants a tool his team will actually adopt (not another dashboard). **Wins when the trial proves itself in one sprint.**

**3. The VP Engineering at enterprise** — Priya, 44, runs a 200-engineer fintech org. Doesn't write specs herself but her org bleeds hours doing it. Needs an answer when the CFO asks "what AI tooling are we deploying?" **Buys after seeing a peer's success and getting the SOC 2 paperwork.**

## Ready?

If your team fits the ICP, here's how to get started:

1. **Choose your plan** — BYOK (€6/seat/month) or Managed (€29/seat/month). Most teams pick Managed.
2. **Record one standup**, see what it produces
3. **Iterate** — the AI gets smarter as it learns your codebase and team patterns

Not sure if you're our customer? [Book a 15-minute demo](mailto:hello@blueberrybytes.com?subject=Plan%20AI%20demo%20request) and we'll tell you honestly. We'd rather refuse a bad-fit customer than churn them in month two.
