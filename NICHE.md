# Plan AI — Niche Strategy & Go-to-Market Playbook

> **Author's note:** This document is a strategic playbook for positioning Plan AI in the market, finding the first 100 paying customers, and validating whether this is a viable business. Read it once end-to-end, then revisit each section as you execute. It assumes you're a solo or small-team founder, you have a working product, and you have not yet done a paid launch.

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Viability assessment — is this a real business?](#2-viability-assessment--is-this-a-real-business)
3. [The niche — who exactly are we for?](#3-the-niche--who-exactly-are-we-for)
4. [Competitive landscape & how we differ](#4-competitive-landscape--how-we-differ)
5. [Positioning & messaging](#5-positioning--messaging)
6. [The buyer — anatomy of an ideal customer](#6-the-buyer--anatomy-of-an-ideal-customer)
7. [Acquisition channels, ranked](#7-acquisition-channels-ranked)
8. [Outbound playbook (cold + warm)](#8-outbound-playbook-cold--warm)
9. [Inbound playbook (content & SEO)](#9-inbound-playbook-content--seo)
10. [The launch sequence (90-day plan)](#10-the-launch-sequence-90-day-plan)
11. [Metrics that matter](#11-metrics-that-matter)
12. [Risks and how to mitigate them](#12-risks-and-how-to-mitigate-them)
13. [Stretch: the expansion ladder](#13-stretch-the-expansion-ladder)
14. [Appendix A — message templates](#appendix-a--message-templates)
15. [Appendix B — community directory](#appendix-b--community-directory)
16. [Appendix C — content calendar starter pack](#appendix-c--content-calendar-starter-pack)

---

## 1. Executive summary

**Plan AI is positioned as "the AI meeting assistant for software teams."** Not "for everyone with meetings" — that's Fathom and Otter's TAM and they will outspend you 100× there. The wedge is _code-aware_ — your meetings produce real Jira/Linear tickets that reference real symbols, files, and execution flows because GitNexus indexes the codebase before generating output.

The thesis in one sentence: **software teams are the rare meeting-tool buyer who will pay €30–60 per seat per month, because the value (auto-generated specs, code-aware tickets, architecture diagrams from standups) compounds with hourly billing rates and avoided rework.**

**Verdict on viability:** _cautiously yes_, conditional on three things.

1. You stay disciplined about the niche for the first 6–12 months and resist the temptation to be "Fathom but also for sales teams".
2. You charge enough — €30–60/seat for managed, €6–15/seat for BYOK. Pricing too low signals "toy" to senior engineers.
3. You sell with demos and conversations, not paid ads, for the first 50 customers. Software buyers do not click ads; they read Hacker News and ask peers.

The 90-day target: **30 paying workspaces, 100 paying seats, ~€2k–4k MRR.** This is enough to prove the model. From there, the ladder is mechanical.

---

## 2. Viability assessment — is this a real business?

### 2.1 The honest framing

Plan AI is competing in the meeting-AI category, which has at least eight well-funded incumbents: Fathom, Otter, Fireflies, Granola, tldv, Read AI, Krisp, Avoma. None of them will fail soon. So your business survives only if you can answer: **"Why would a software team choose Plan AI over Fathom + Zapier + Linear?"** — repeatedly, every time you sit down with a prospect.

The answer must be specific, demonstrable in a 5-minute demo, and structurally hard for competitors to copy. The candidate answers:

| Differentiator                                                              | Specific?       | Demo-able?     | Structurally defensible?                                    |
| --------------------------------------------------------------------------- | --------------- | -------------- | ----------------------------------------------------------- |
| Code-aware ticket creation (GitNexus)                                       | ✅ very         | ✅ killer demo | ✅ requires deep code-graph infra                           |
| Multimodal post-meeting outputs (docs + slides + diagrams)                  | ⚠️ partial      | ✅             | ❌ Fathom + Gamma can fake this                             |
| BYOK pricing                                                                | ❌ generic      | ❌             | ❌ easy to copy                                             |
| Multi-platform (recorder + web + mobile)                                    | ⚠️ table stakes | ❌             | ❌                                                          |
| Deep ticket field mapping (story points, acceptance criteria, dependencies) | ✅              | ✅             | ⚠️ moderate — Fathom could close this with Zapier templates |

**Conclusion: GitNexus + deep ticket creation is the moat.** Everything else is supporting evidence.

### 2.2 Market size sanity check

Rough math, conservative:

- **Software companies globally with 5–500 engineers:** ~200,000 (GitHub orgs, AngelList, Crunchbase intersected)
- **Realistic addressable subset (English-speaking, paid SaaS culture, runs structured meetings):** ~40,000 orgs
- **Average team size:** 12 engineers
- **At €40/seat/month managed average:** €480 ARR per seat × 12 seats × 40,000 = €230M TAM

Even capturing **0.5%** of that is €1.15M ARR. Capturing 2% is €4.6M ARR. These are realistic ceilings for an indie-to-Series-A trajectory.

Software-services agencies (consultancies) are a denser slice within this:

- **Software agencies globally with 5–100 engineers:** ~80,000 (Clutch, Goodfirms data extrapolated)
- **Particularly fits because they charge clients hourly** → spec-writing time is direct revenue lost
- This is your **beachhead segment** for the first 50–100 customers.

### 2.3 What success looks like at each stage

| Stage                            | Workspaces | MRR       | Implication                                                                     |
| -------------------------------- | ---------- | --------- | ------------------------------------------------------------------------------- |
| **Validation** (months 1–3)      | 10–30      | €500–€2k  | Niche resonates, demo lands, you've nailed the pitch                            |
| **Repeatability** (months 4–9)   | 50–150     | €5k–€15k  | You can predict CAC, churn under 5%/mo, content drives 30%+ of pipeline         |
| **Scale** (months 10–18)         | 300–800    | €30k–€80k | Time to hire #1 (developer relations / content), light fundraising window opens |
| **Plateau or pivot** (month 18+) | 1k+        | €100k+    | Decide: stay vertical SaaS bootstrapped, or broaden horizontally with capital   |

If you hit fewer than **15 paying workspaces in the first 90 days after a real launch with the niche positioning**, the thesis is wrong. Stop, talk to the customers you did get, find out why, and pivot the position (not the product).

---

## 3. The niche — who exactly are we for?

### 3.1 The single-sentence ICP

> **A software team of 5–50 engineers that runs at least 3 recurring meetings per week, uses Jira / Linear / Notion for tickets, and has a senior engineer or engineering manager who feels the pain of "we discussed this in standup, then nobody wrote it down".**

### 3.2 The three buyer segments inside the niche

**Segment A — Software agencies / consultancies (the beachhead)**

- **Headcount:** 5–80 employees, mostly engineers, designers, PMs
- **Pain:** They bill clients hourly. Every hour a senior dev spends transcribing a discovery call or writing acceptance criteria is unbilled. Plan AI auto-generates client-ready specs and Jira tickets from the same recording.
- **Buyer:** Founder / CTO / Engineering Lead
- **Why they buy first:** Sharpest ROI math ("4 hours/week saved × €120/hour × 12 devs = €23k/month value"); willingness to pay highest
- **Where to find them:** Clutch, GoodFirms, dev agency Slack communities (e.g. "Dev Agencies" in Slack), Upwork enterprise leaderboard, conference attendee lists (e.g. SaaStock, MicroConf)

**Segment B — Product engineering teams at Series A–C startups**

- **Headcount:** 10–60 engineers in a wider org
- **Pain:** Standups, design reviews, customer-discovery calls all happen but artifacts decay. Eng managers spend their Fridays rewriting tickets from Slack threads. Onboarding new engineers means re-explaining decisions made in meetings 6 months ago.
- **Buyer:** Engineering Manager / VP Eng / sometimes a tech-forward PM
- **Why they buy second:** Bigger seat count, longer sales cycle, but recurring expansion as the org grows
- **Where to find them:** Lenny's community, First Round Review readers, ProductHunt makers, Indie Hackers operators, LinkedIn (filter: VP Engineering at companies with 50–250 employees)

**Segment C — In-house engineering at non-tech-first companies (banks, retailers, healthtech)**

- **Headcount:** 20–500 engineers but often in 5–15 person squads
- **Pain:** Compliance + audit pressure means meetings _must_ produce written artifacts. Currently a junior writes minutes by hand. Plan AI replaces that role for a fraction of the cost.
- **Buyer:** Director of Engineering / VP Software / sometimes Procurement-led for compliance
- **Why they buy third:** Slowest sales cycle, longest contracts, biggest seat counts. Worth the wait but not the first focus.
- **Where to find them:** Conference sponsorships (KubeCon, AWS re:Invent), LinkedIn ads to "Director of Engineering, Banking", InfoQ readership

### 3.3 Non-customers (be ruthless)

People who look like customers but will frustrate you:

- **Solo founders or 2-person teams.** They don't have enough meetings. They churn after 1 month. Either steer them to a free tier or politely decline.
- **Sales teams, customer success teams, recruiters.** They're Fathom's bread and butter. You'll lose to free. Don't market to them.
- **Non-English-speaking teams in markets where Deepgram quality is mediocre.** Until you validate multilingual quality with native speakers, restrict your marketing to English/Spanish.
- **"AI curiosity" buyers from non-software industries.** They want to try the tech but won't extract enough value to renew. Politely educate them on the niche.
- **Companies on Microsoft Teams that won't let third-party recorders join.** Your value prop collapses without recording access. Until you build the Teams app, skip them.

---

## 4. Competitive landscape & how we differ

### 4.1 The category map

```
                  Generic / horizontal              Vertical / software-team
                  ──────────────────────────────────────────────────────────
  Recording +     Fathom              ┊             [ Plan AI ]
  AI summary      Otter               ┊
                  Fireflies           ┊
                  Granola             ┊
                  tldv                ┊
                  Read AI             ┊
                  ──────────────────────────────────────────────────────────
  Task / project  Jira AI             ┊             Linear AI
  layer only      Asana Intelligence  ┊             ClickUp Brain
                  ClickUp Brain       ┊
                  ──────────────────────────────────────────────────────────
  Code-aware      —                   ┊             Cursor (IDE, not meetings)
                                                    Greptile (code review only)
```

**Plan AI sits alone in the bottom-right.** Code-aware meetings + project execution is a category of one.

### 4.2 Head-to-head positioning

**vs Fathom**

- Their pitch: "Free AI notetaker. Works with Zoom, Meet, Teams."
- Their weakness: ticket creation is shallow (sends a list to your task tool); no code awareness; pricing requires 5+ seats to feel premium.
- Your line: _"Fathom gives you bullet points. Plan AI gives your engineers Jira tickets with acceptance criteria informed by your actual codebase."_

**vs Granola**

- Their pitch: "The smart notepad. Mac app for prosumers, $14/mo."
- Their weakness: solo workflow, no team layer, no project management depth, no code awareness.
- Your line: _"Granola is a notepad. Plan AI is the production line that turns notes into tickets, specs, and diagrams that your team actually ships."_

**vs Linear AI / Jira AI**

- Their pitch: "AI inside your project management tool."
- Their weakness: they don't have the meeting itself. You have to manually feed them the input. They live downstream of the recording.
- Your line: _"Linear AI helps when you already have a ticket. Plan AI creates the ticket while you're still in standup."_

**vs Fathom + Zapier + Linear (the DIY stack)**

- This is the most common objection. A dev can stitch this together.
- Their weakness: ticket quality is garbage (no project context, no codebase context, no field discipline); maintenance burden falls on the dev who built the Zap.
- Your line: _"A Zap is 30 lines of YAML and a ticket that says 'follow up on the auth bug'. Plan AI is one product where the ticket says 'Refactor `verifyToken` in src/auth/middleware.ts — current implementation throws on expired refresh tokens (line 42); add try/catch and return 401', with proper acceptance criteria."_

### 4.3 What competitors can copy and what they can't

| Capability                              | Time to copy          | Likely to copy?                              |
| --------------------------------------- | --------------------- | -------------------------------------------- |
| Recording + transcription               | 1 month               | Already have it                              |
| AI summary                              | 2 weeks               | Already have it                              |
| Ticket creation to Jira/Linear          | 1–2 months            | Yes, eventually                              |
| Multimodal outputs (slides, diagrams)   | 3–4 months            | Possible                                     |
| **Code graph awareness (GitNexus)**     | **12–18 months**      | **No — wrong company DNA**                   |
| Vertical positioning for software teams | 0 days but they won't | No — would alienate their existing customers |

The defensible moat is GitNexus + the choice to stay vertical. Both depend on you, not on capital.

---

## 5. Positioning & messaging

### 5.1 The hierarchy of messages

Don't put 14 features on the landing page. Use this hierarchy:

```
[HERO]      Code-aware standups → real Jira tickets in 30 seconds.
            (one-line subhead) Plan AI records your engineering meetings, understands your codebase,
            and ships specs, diagrams, and tickets your team actually uses.

[DEMO]      60-second video: standup happens → ticket appears in Linear with
            acceptance criteria that references `src/auth/middleware.ts` lines 40–58

[PROOF]     Testimonial card from one software agency: "We've cut spec-writing
            from 4 hours a week per engineer to 20 minutes." — CTO at [agency]

[FEATURES]  Three columns:
            1. Code-aware tickets
            2. Auto-generated docs & specs
            3. Architecture diagrams from conversation

[PRICING]   Two columns: BYOK | Managed. Three tiers each. CTAs lead to checkout.

[FAQ]       Five questions: "What about Microsoft Teams?", "Does it support GitLab?",
            "Can I self-host?", "How is GitNexus different from Sourcegraph?",
            "What languages does Deepgram support well?"
```

### 5.2 The taglines (rank-ordered, test the top 3)

1. **"Standups in. Jira tickets out."**
2. **"The AI meeting assistant for software teams."**
3. **"Your meetings know your codebase."**
4. "From standup to spec in 60 seconds."
5. "Stop writing tickets after meetings. Start shipping them during."

### 5.3 The 30-second pitch (memorize this)

> _"Plan AI records your engineering meetings, understands your codebase via a code graph, and automatically ships Jira tickets with proper acceptance criteria, technical specs that reference real files, and architecture diagrams. Software agencies on it cut spec-writing time by 80%. It's like having a senior engineer take notes for you — except the notes are ready to assign and ship."_

Practice it in front of a mirror until it feels natural. You'll deliver it on calls 200+ times in the next year.

### 5.4 The 5-minute demo script

1. **0:00–0:30** — "Imagine you just finished a standup. Here's the recording." Play 30 seconds of an engineering standup audio. Show the recorder.
2. **0:30–1:30** — "Plan AI transcribes and diarizes. Here's the structured transcript. Notice it identifies speakers by name."
3. **1:30–2:30** — "Now watch what it produces." Click into Jira/Linear. Show the auto-created tickets — full title, description, acceptance criteria, story points, links to the relevant code files.
4. **2:30–3:30** — "Here's how it does that." Show GitNexus briefly — a code graph that the AI queries before generating each ticket.
5. **3:30–4:30** — "And here's the technical spec it wrote in parallel, ready to paste into Notion." Show the generated doc with embedded Mermaid diagram.
6. **4:30–5:00** — "All of this happened automatically while your team got their next coffee. Pricing is on the site, start free, BYOK if you want to control AI cost."

### 5.5 Messaging do's and don'ts

**DO**

- Use specific engineering nouns: standup, retro, design review, sprint planning, post-mortem
- Show file paths and code in screenshots
- Mention specific tools (Linear, Jira, GitHub) by name
- Use dev-tribal language ("ship", "ticket", "spec")

**DON'T**

- Say "boost productivity" or "transform your meetings" — generic SaaS slop
- Use stock photos of people in suits in conference rooms
- Compare yourself to Fathom in the headline (you can mention it later, in the FAQ)
- Promise "AI magic" — engineers are immune to that copy

---

## 6. The buyer — anatomy of an ideal customer

### 6.1 The persona deck (use these in outbound)

**Persona 1: "Maria, CTO of a 15-person dev agency in Barcelona"**

- 32, ex-senior engineer at a startup, started the agency 3 years ago
- Bills clients €120–180/hour
- Pain: spends Fridays writing specs from her own meeting notes, hates it
- Wants: time back, professional-looking client deliverables, faster onboarding for new hires
- Buying signal: complains on LinkedIn about "context switching"
- Where she hangs out: Indie Hackers, X/Twitter dev community, Barcelona startup Slack, founder dinners
- **Channel that converts her:** Personal LinkedIn message from you with a 60-second Loom demo

**Persona 2: "James, Engineering Manager at a 40-engineer Series B SaaS in London"**

- 36, manages 3 squads, reports to VP Eng
- Pain: 5 hours/week of his calendar is "writing things down so people don't forget"
- Wants: a tool his team will actually adopt (not another dashboard); good Jira integration
- Buying signal: searches "AI for engineering managers" or "automate sprint planning"
- Where he hangs out: Lenny's community, Engineering Leadership Slack, LinkedIn long-form posts, Reforge events
- **Channel that converts him:** SEO-driven blog post + free trial; he'll never reply to cold outreach

**Persona 3: "Priya, VP Engineering at a 200-engineer fintech in NYC"**

- 44, ex-FAANG, runs the whole eng org, sits on the leadership team
- Pain: doesn't directly write specs anymore, but her org is bleeding hours doing it
- Wants: an answer when the CFO asks "what AI tooling are we deploying?"
- Buying signal: company already uses GitHub Copilot, Cursor, or similar; she signs the contract
- Where she hangs out: she doesn't have time for online communities; she gets recs from her peer group
- **Channel that converts her:** Warm intro from a customer in her network; or a Hacker News thread with 500+ upvotes that gets forwarded to her

### 6.2 The buying process by segment

**Agencies (Segment A):**

- Discovery → demo → trial → purchase, all in **3–10 days**
- One decision-maker (founder/CTO)
- Often pay annually upfront if you offer 15%+ discount
- Sales: outbound + demo

**Series A–C product teams (Segment B):**

- Discovery → demo → trial (1–2 weeks) → champion sells internally → purchase
- 2–3 stakeholders
- Want monthly billing initially, will switch to annual after 60 days
- Sales: inbound (content) + product-led trial

**Non-tech enterprises (Segment C):**

- 30–90 day cycle; legal/security review
- 4–8 stakeholders
- Annual or multi-year contracts only
- Requires SOC 2, SSO, audit logs — **you don't have these yet**, so don't waste cycles here for now

---

## 7. Acquisition channels, ranked

Ranked by ROI for a solo/small founder selling to software teams. **Do channels 1–4 in months 1–3. Add 5–7 once channels 1–4 produce 10+ paying customers.**

### 7.1 Channel ranking

| Rank | Channel                                         | Cost            | Speed                                     | Notes                                                                 |
| ---- | ----------------------------------------------- | --------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| 1    | **Founder-led outbound (LinkedIn + email)**     | €0              | Fast (days)                               | Highest conversion, doesn't scale, but perfect for first 50 customers |
| 2    | **Hacker News (Show HN + organic comments)**    | €0              | Spiky (one big day)                       | One good launch = 5,000 site visits + 20 trials                       |
| 3    | **Indie Hackers + Product Hunt launch**         | €0              | Days                                      | Lower-quality leads than HN but more sustained                        |
| 4    | **Founder content (X/Twitter, LinkedIn, blog)** | Time            | Slow build (3–6 mo)                       | Compounds; non-negotiable for inbound long-term                       |
| 5    | **Niche communities (agency Slacks, Discord)**  | Time            | Medium                                    | Slow trust-building, very high conversion when warm                   |
| 6    | **Affiliate / referral with dev influencers**   | 20–30% revshare | Fast                                      | Your 300k friend's audience falls here                                |
| 7    | **SEO blog content**                            | Time            | Slow (6–12 mo)                            | Compounds; start month 3 once you know what to write                  |
| 8    | **Paid ads (LinkedIn, Twitter, Google)**        | €€€             | Fast but unprofitable until LTV is proven | Don't touch until month 9                                             |
| 9    | **Conferences (sponsor or speak)**              | €€€             | Slow ROI                                  | Only if you have a clear ROI from one specific conference             |
| 10   | **Cold display advertising**                    | €€€             | Never works for this category             | Skip entirely                                                         |

### 7.2 Where the 300k-influencer push fits

If they're a **dev influencer** (e.g. Theo, Fireship, ThePrimeagen, Lenny Rachitsky, Dan Abramov, etc.):

- This is your **single biggest channel** for the first 90 days
- Treat it like a launch: full landing page rewrite, pricing locked, promo code, capacity to onboard 50+ trials in one weekend
- Expected outcomes (rule-of-thumb): 300k followers → 0.5–2% click = 1,500–6,000 visits → 5–15% trial signup = 75–900 trials → 5–10% paid = 4–90 paying workspaces from a single push
- The variance is huge; aim for the middle (€2k–€8k MRR added in 30 days)

If they're a **general lifestyle/business influencer**:

- Don't waste them on the niche launch
- Save for later, when you have a horizontal product line or a B2C angle
- Better to ask them to introduce you to specific people they know (CTOs, founders) than to broadcast

---

## 8. Outbound playbook (cold + warm)

### 8.1 Building the target list

**Sources for dev-agency leads (Segment A):**

1. **Clutch.co** — filter by "Software Development", company size 10–49, location English-speaking. Export the top 500 agencies; manually annotate each with founder LinkedIn URL.
2. **GoodFirms** — same shape, complementary data
3. **Upwork enterprise clients** — agencies that hire freelancers tend to _be_ small agencies themselves
4. **GitHub orgs with public clients** — search org READMEs for "we're a software studio / agency"
5. **Twitter/X dev community** — search for "founder of [agency name]" or "we build apps for"
6. **Local startup ecosystems** — Barcelona Tech City, NYC Tech Meetup, London Tech Week attendee lists

**Sources for product engineering teams (Segment B):**

1. **AngelList Talent / Wellfound** — companies with active engineering hiring
2. **LinkedIn Sales Navigator** — filter "Engineering Manager", "VP Engineering" at companies 30–250 employees, technology industry
3. **YC startup directory** — every YC company has an engineering team; alums are friendly to indie tools
4. **Lenny's job board readers** — proxy for product-minded folks
5. **First Round Review subscribers** — same
6. **GitHub stargazers of dev productivity tools** — Linear users, GitHub Projects users, Jira-software-cloud users

**Tooling to build the list:**

- **Clay** (€349/mo) — best ICP enrichment tool, scales to 10k leads
- **Apollo** — cheaper alternative, slightly worse data
- **Linkedin Sales Navigator** (€90/mo) — for surgical outreach
- **Hunter.io** — email verification
- **PhantomBuster** — LinkedIn scrapers (use sparingly to avoid bans)

Spend €100–€300/month on tooling for the outbound layer in months 1–3. Don't go above that until you have a CAC payback calculation.

### 8.2 The outreach sequence

**Day 1 — LinkedIn connection request (no pitch):**

> Hey [Name], saw your work at [agency]. I'm building Plan AI — turns dev standups into proper Linear tickets. Curious if I can show you a 60-second demo sometime; would love a software-agency POV.

**Day 4 — Email if they accepted but didn't reply:**

```
Subject: 60-second video — Plan AI for [Agency Name]

Hi [Name],

Saw [specific detail about their work — recent blog post, client, GitHub repo].

Built a quick demo of Plan AI for an agency like yours:
[link to 60s Loom showing their stack — Linear or Jira, GitHub, etc.]

Software agencies who've tried it report cutting spec-writing time by ~80%.

If interesting, here's the trial: [link]. Happy to do a live walkthrough
if you prefer — 15 min, your calendar [calendly link].

— Xavier
```

**Day 9 — Last LinkedIn message:**

> Hey [Name] — last nudge, then I'll stop bothering you. We just launched a BYOK tier at €6/seat for agencies that want to bring their own OpenRouter keys. If that fits, here's the page: [link]. Otherwise no worries, will keep building and check back in 3 months.

**Day 30+ — Add to a quarterly "what changed" email.** Not a sales sequence. A friendly update on what the product can do now. ~30% of these convert eventually.

### 8.3 Conversion math to plan for

- **Connection request acceptance:** 30–40%
- **Reply rate (any reply):** 8–15%
- **Demo booked:** 3–5% of total contacted
- **Demo → trial:** 60–80%
- **Trial → paid:** 20–40%
- **Net: 1–2 paying customers per 100 contacted**

To get 30 customers in 90 days: contact 2,000–3,000 people. That's ~35 contacts/day, 5 days/week. **Feasible solo.**

---

## 9. Inbound playbook (content & SEO)

### 9.1 The content pillars

Pick **three pillars**. Every post fits one of them.

1. **"Code-aware AI tooling"** — opinionated takes on AI tools that "actually" understand codebases. Mention Cursor, Greptile, Sourcegraph, GitNexus, etc.
2. **"How software agencies ship faster"** — operational content for agency founders.
3. **"Modern engineering meeting hygiene"** — how to run good standups, retros, design reviews; subtle integration of Plan AI as the artifact layer.

### 9.2 The first 12 pieces of content (months 1–4)

| #   | Title                                                                        | Pillar | Channel           | Goal                     |
| --- | ---------------------------------------------------------------------------- | ------ | ----------------- | ------------------------ |
| 1   | Show HN: Plan AI — code-aware AI meeting assistant for software teams        | All    | HN                | Launch spike             |
| 2   | I cut spec-writing by 80% with code-aware AI. Here's how.                    | 1      | X thread + blog   | Top of funnel            |
| 3   | Why software agencies are the best beachhead for AI productivity tools       | 2      | Indie Hackers     | Persona signal           |
| 4   | The death of the meeting notetaker (and what replaces it)                    | 3      | Blog + LinkedIn   | SEO + thought leadership |
| 5   | Anatomy of a perfect Jira ticket — and why your AI can't write one yet       | 1      | Blog              | SEO long-tail            |
| 6   | I rebuilt our standup process around AI. Three months in, here's what works. | 3      | Lenny's community | Persona B                |
| 7   | Open-sourcing our Deepgram keyword extraction prompts                        | 1      | GitHub gist + X   | Dev tribe credibility    |
| 8   | How to evaluate AI tooling for your engineering org (a 7-point checklist)    | 2      | Blog + LinkedIn   | Persona C reach          |
| 9   | Why we built Plan AI on BYOK (Bring Your Own Keys)                           | 1      | Blog + HN         | Differentiation          |
| 10  | The 3 meetings every software agency wastes time on                          | 2      | Twitter thread    | Persona A pain           |
| 11  | Real customer story: how [agency name] uses Plan AI for client discovery     | 2      | Blog              | Social proof             |
| 12  | Roadmap update + lessons from the first 50 customers                         | All    | Public blog       | Build in public          |

### 9.3 SEO long-tail targets (publish over 6–12 months)

Each of these has search volume between 50–500/mo, low competition, and high intent:

- "ai meeting notes for software teams"
- "automate jira ticket creation"
- "linear ai ticket from meeting"
- "best meeting transcription for engineering teams"
- "alternatives to fathom for developers"
- "ai notetaker with codebase context"
- "how to generate jira tickets from standup"
- "ai documentation generator for engineering teams"

Each post = ~1,500 words, real screenshots, embedded demo Loom, clear CTA. Aim for 1 per week starting month 3.

### 9.4 Building in public

Software founders eat this up. The cadence:

- **Daily** — short tweet/X post (build progress, customer quotes, screenshots)
- **Weekly** — longer LinkedIn or blog post (lessons learned, behind-the-scenes)
- **Monthly** — public revenue/customer count update if comfortable; or a roadmap post

A founder doing this consistently for 12 months will have 5k–20k followers and 10–30% of pipeline coming inbound, no ad spend.

---

## 10. The launch sequence (90-day plan)

### Month 1 — Foundation

**Week 1 — Position and price**

- Rewrite landing page hero to "Code-aware standups → real Jira tickets in 30 seconds"
- Record the 60-second hero demo video
- Set pricing: Pro BYOK €6, Pro Managed €29, Business BYOK €14, Business Managed €65
- Create Stripe payment links for all 4 paid tiers
- Add pricing page to the site

**Week 2 — Build the lead pipeline**

- Buy Clay or Apollo subscription
- Build target list: 500 software agencies (Segment A) + 300 product teams (Segment B)
- Set up a basic CRM (Folk, Attio, or just Notion + Airtable)

**Week 3 — Outbound starts**

- Send 35 LinkedIn connection requests/day, with the 3-touch sequence
- Schedule 3–5 demo calls/week
- Iterate the demo based on every call

**Week 4 — First content drop**

- Post #1: Show HN launch (Tuesday morning UTC = best slot)
- Post #2: Twitter thread on "how we built code-aware ticket creation"
- Post #3: LinkedIn long-form on the founder story

**Target by end of month 1:** 5 paying workspaces, 15 trials, 1 published case study (even if self-written from a friendly user).

### Month 2 — The influencer push

**Week 5 — Pre-launch with influencer**

- Confirm date, deliverables, promo code, attribution method
- Capacity check: can your infra handle a 10× spike for 48h? (Likely yes given BullMQ + Redis architecture)
- Onboarding flow polish: signup → workspace → first recording in <90 seconds

**Week 6 — Launch with influencer**

- Influencer drops; promo code goes live (e.g. `LAUNCH50` — 50% off year 1, capped at first 200 redemptions)
- You personally onboard the first 50 paying workspaces
- Live-tweet/post the launch day metrics for build-in-public effect

**Week 7 — Capture and convert**

- Trial users get a 14-day onboarding sequence with daily emails
- Power users get a personal Loom from you within 48h of signup
- Run a webinar / live demo at the end of the trial period for unconverted trials

**Week 8 — Pause and learn**

- Audit every customer who converted: why?
- Audit every trial who didn't: why?
- Adjust pricing, messaging, or product based on top 3 objections

**Target by end of month 2:** 20–40 paying workspaces, 80–150 paying seats, €1.5k–€4k MRR.

### Month 3 — Repeatability

**Week 9–10 — Content engine spin-up**

- Publish 2 SEO posts/week
- Daily X/LinkedIn presence
- Start a "Friday update" email to all signups + waitlist

**Week 11 — Outbound continues**

- Same cadence as month 1: 35 outreach/day, 5 demos/week
- Add: agency Slack communities. Join 5 of them, contribute genuinely, mention Plan AI organically when asked

**Week 12 — First customer testimonials**

- 3–5 video testimonials from happiest paying customers
- One detailed written case study (1,000 words, real numbers, with permission)
- Use these everywhere: landing page, outbound emails, ads (if you start them later)

**Target by end of month 3:** 30–60 paying workspaces, €3k–€8k MRR. **If you hit the low end, the niche is validated; double down. If you hit below 15 workspaces, re-evaluate the niche or the pricing.**

---

## 11. Metrics that matter

Track these weekly. Build a simple dashboard (Notion table is fine; don't over-engineer).

| Metric                      | Definition                                                                 | Target at month 3 | Target at month 12 |
| --------------------------- | -------------------------------------------------------------------------- | ----------------- | ------------------ |
| **MRR**                     | Sum of monthly subscription revenue                                        | €3k–€8k           | €30k–€60k          |
| **Paying workspaces**       | Workspaces with non-FREE tier                                              | 30–60             | 300–500            |
| **Paid seats**              | Sum of `WorkspaceMember` rows in paid workspaces                           | 100–250           | 2,000–4,000        |
| **Trial → paid conversion** | % of trials that become paying                                             | 15–25%            | 20–30%             |
| **Logo churn**              | % of workspaces canceling each month                                       | <8%               | <3%                |
| **Seat expansion**          | Average seats per workspace at month 6 vs month 1                          | +20%              | +50%               |
| **CAC payback**             | Months until a customer's revenue covers their acquisition cost            | <6 months         | <4 months          |
| **NPS**                     | "How likely are you to recommend Plan AI to another software team?" (0–10) | >40               | >50                |
| **Demo → close**            | % of demos that become paying customers                                    | >25%              | >35%               |

Two metrics to obsessively monitor in months 1–3:

1. **Trial → paid conversion.** If under 10%, the product isn't ready or pricing is wrong. If over 30%, you're probably charging too little.
2. **Logo churn.** Anything above 10%/month means the product doesn't deliver enough lasting value. Pause growth, fix retention.

---

## 12. Risks and how to mitigate them

### Risk 1 — Fathom or Otter adds GitHub integration

**Likelihood:** medium-low (2 years).
**Impact:** high if it happens before you have brand.
**Mitigation:** ship faster on the depth (deeper code-graph features, more languages, more PM tools). Build a moat that's _code intelligence quality_, not just _we have it_.

### Risk 2 — Deepgram or OpenRouter raises prices

**Likelihood:** medium.
**Impact:** medium — squeezes managed-tier margin.
**Mitigation:** BYOK tier shields you from this entirely; revisit managed pricing every 6 months; keep model abstraction so you can switch providers.

### Risk 3 — Microsoft Teams blocks third-party recorders

**Likelihood:** low.
**Impact:** medium — locks you out of enterprise segment.
**Mitigation:** Build a native Teams app (manifest + side panel) by month 12. Until then, focus marketing on Meet/Zoom users.

### Risk 4 — The 300k influencer push under-performs

**Likelihood:** medium (always overestimated).
**Impact:** demoralizing, not fatal.
**Mitigation:** treat it as one of many channels, not the launch. Even if it produces only 5 paying customers, it's testimonials + content + brand for free.

### Risk 5 — You burn out solo

**Likelihood:** high (founder reality).
**Impact:** fatal.
**Mitigation:** define a 90-day plan and protect 2 days/week from outreach for actual product work. Hire a part-time SDR or community manager at €30k ARR.

### Risk 6 — Pricing is wrong

**Likelihood:** very high (always wrong on first try).
**Impact:** medium.
**Mitigation:** the launch IS the price test. Plan to adjust at month 3, month 6, month 12. Grandfather existing customers each time you raise. Communicate transparently.

### Risk 7 — GDPR / recording-consent in EU

**Likelihood:** real concern in EU SaaS.
**Impact:** legal exposure if not handled.
**Mitigation:** you already have a PrivacyConsentDialog in the recorder. Add a meeting-start announcement feature ("This meeting is being recorded by Plan AI"). Publish a DPA template for B2B customers. Don't ignore.

### Risk 8 — Audio quality issues kill trials

**Likelihood:** medium (you already had bugs around system audio).
**Impact:** medium — first impression is everything.
**Mitigation:** keep the recorder reliability bar high. Every audio bug is a churn risk; treat them as P0. Consider upgrading Deepgram tier so live transcription works for both mic and system audio.

---

## 13. Stretch: the expansion ladder

Once you have 200+ paying workspaces in the software niche, broaden in this order:

1. **Design and product agencies** (year 2, Q1). Same business model (hourly billing), similar pain. Adds 3× TAM.
2. **In-house product teams at non-tech companies** (year 2, Q2). Banks, retailers, healthtech. Requires SOC 2 — make this a year-2 priority.
3. **Consulting firms (McKinsey-style)** (year 2, Q3). Bigger seat counts, longer cycles. Probably needs an enterprise sales hire.
4. **Cross-functional teams (product + design + eng)** (year 3). The "Notion for meetings" play. Bigger TAM, more competition.
5. **Eventually, a self-serve free tier broadcast horizontally** (year 3+). Once brand is established, lower the floor to grow the funnel.

**Do not skip step 1.** Each expansion step assumes the previous one created enough revenue + brand for the next.

---

## Appendix A — Message templates

### A.1 LinkedIn first-touch (software agency)

> Hey [first name] — saw [agency] does [specific service: React Native consulting / data engineering / etc]. I built a tool that turns dev standups into Linear/Jira tickets with acceptance criteria informed by the actual codebase. Probably useful for an agency your size. Mind if I send a 60-second demo?

### A.2 LinkedIn first-touch (engineering manager)

> Hey [first name] — quick one. We're shipping an AI meeting assistant specifically for engineering teams (not sales). Code-aware, generates tickets and specs from your standups. Would love your gut take — even 5 mins of harsh feedback. Open to a quick chat?

### A.3 Cold email — agency CTO

```
Subject: 60-second demo for [Agency Name]

Hi [Name],

Saw [agency] has been shipping [recent project / case study they posted].
Looks like solid work.

Quick question: how does your team write up specs and tickets after client
discovery calls? I'm asking because I built Plan AI — records the call,
understands the client's codebase, and produces ready-to-assign Jira/Linear
tickets with acceptance criteria.

For a 15-person agency, the math typically works out to ~8 senior hours
saved per week. Worth €4k/month at your typical billing rate.

60-second video showing exactly what it does: [Loom link]

If interesting, here's the trial — no credit card: [link]. Or grab 15 min
on my calendar [Calendly]. I'd love a real agency's feedback either way.

— Xavier
Founder, Plan AI
```

### A.4 Demo request follow-up (no-show)

> Hey [Name], we had a call scheduled for [time] — life happens! Want to find a new slot? Or if Plan AI doesn't seem like a fit anymore, no worries, just let me know and I'll stop pinging. [Calendly link]

### A.5 Post-demo follow-up (interested)

> Thanks for the time today, [Name]. As promised:
>
> - Trial link with [their email] pre-loaded: [URL]
> - Loom recap of the demo: [URL]
> - Promo code valid 14 days: `[CODE]` (40% off year 1)
>
> I'll check in next Tuesday unless you have questions before. Excited to see what your team thinks.

### A.6 Trial ending — convert push

> Hey [Name] — your Plan AI trial ends in 48h. Quick check: did the tool fit how your team works? If yes, here's the upgrade link with the promo code locked in: [URL]. If no, I'd love 10 minutes of brutal feedback — what didn't land?

### A.7 Re-engage cold trial (30 days post-expiry)

> Hi [Name] — Plan AI shipped some big stuff this month: [feature 1], [feature 2], [feature 3]. Wanted to give you a heads up. If you want to re-trial, [link]. Else no worries, just keeping you posted.

---

## Appendix B — Community directory

### B.1 Where software agency founders hang out

- **Indie Hackers** — indiehackers.com (top community for solo + small-team SaaS)
- **Dev Agency** Slack community
- **Founder Café** Slack
- **MicroConf** (yearly conference + community)
- **Built in Public** Discord
- **Twitter/X dev community** (#buildinpublic, #devagency hashtags)
- **r/cscareerquestions, r/ExperiencedDevs, r/SoftwareEngineering** on Reddit

### B.2 Where engineering managers / VPs hang out

- **Lenny's community** (premium, but excellent)
- **Engineering Leadership Slack** (free)
- **LeadDev** (community + conference)
- **The Manager's Path readers** (Camille Fournier's book — its community spinoffs)
- **Plato** (engineering leadership mentorship platform)
- **HackerNoon, InfoQ** (publication communities)

### B.3 Where dev influencers operate

- **X/Twitter** — primary platform
- **YouTube** — Fireship, Theo, ThePrimeagen, Web Dev Simplified, NetworkChuck, etc.
- **Twitch** — ThePrimeagen, dev streamers
- **Newsletters** — Bytes, JavaScript Weekly, Pointer, Last Week in AWS

### B.4 Aggregators worth tracking

- **Hacker News** (`hn.algolia.com` for keyword tracking)
- **Lobsters** (smaller but high-quality dev community)
- **Dev.to** (lower bar, broader reach)
- **Product Hunt** (one-shot launch channel)

---

## Appendix C — Content calendar starter pack

Twelve weeks. Adjust as you go.

**Week 1**

- Mon: Set up landing-page foundation
- Wed: Show HN launch post (write copy, prep visuals)
- Fri: Twitter/X thread: "I'm launching Plan AI today — here's why software teams should pay attention"

**Week 2**

- Tue: Blog post: "Why Fathom isn't built for engineers (and what is)"
- Thu: LinkedIn long-form: "What I learned from 20 demos this week"
- Fri: Twitter thread: "The anatomy of a perfect Jira ticket"

**Week 3**

- Mon: Open-source: publish keyword-extraction prompts on GitHub
- Wed: Blog post: "How GitNexus works — the code graph behind Plan AI"
- Fri: Indie Hackers post: "First 10 customers in 30 days — here's exactly how"

**Week 4**

- Mon: Customer story #1 (even if a friendly user)
- Wed: Twitter thread: "Why software agencies should automate spec writing"
- Fri: Blog post (SEO): "AI meeting notes for software teams: a comparison"

**Week 5–8** (influencer push period)

- Heavy real-time content. Build-in-public live updates. Daily X. Weekly LinkedIn long-form.

**Week 9**

- Mon: Roadmap update post
- Wed: Customer story #2
- Fri: Blog post (SEO): "Best alternatives to Fathom for engineering teams"

**Week 10**

- Mon: Twitter thread: "5 meetings every dev team should record (and why)"
- Wed: LinkedIn: "How to evaluate AI tooling for engineering — a checklist"
- Fri: Blog post: "How to onboard new engineers with AI meeting artifacts"

**Week 11**

- Mon: Open-source: another small useful repo (prompt templates, integration recipes)
- Wed: Twitter thread: "I read 100 standup recordings. Here are 5 patterns of good engineering teams"
- Fri: Blog post (SEO): "Linear AI vs Plan AI — when to use which"

**Week 12**

- Mon: 90-day retrospective: numbers, lessons, what's next
- Wed: Customer story #3 (ideally a real case study with numbers)
- Fri: Year-end roadmap post / next-quarter teaser

---

## Closing note

**This document is a hypothesis, not a prediction.** Test it. Talk to customers. Adjust positioning when reality contradicts theory. The single highest-leverage activity in months 1–3 is _talking to humans_ — outbound, demos, founder calls, customer interviews. Every other section in this doc exists to make those conversations more productive.

The product is good. The market is real. The niche is sharp. If you execute the 90-day plan above with discipline, the answer to "is this viable?" will be obvious by month 4 — and if it isn't, you'll know exactly which lever to pull next.

Now go talk to the first three software agencies on your list.

— End of document —
