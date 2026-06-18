# Apollo.io — Sales Intelligence & Outreach Guide

A comprehensive guide to using Apollo.io for lead generation, prospecting, and outreach within the Plan AI sales workflow.

---

## Table of Contents

- [What is Apollo.io?](#what-is-apolloio)
- [Getting Started](#getting-started)
- [People Search & Filters](#people-search--filters)
- [Company Search & Filters](#company-search--filters)
- [Saved Searches & Lists](#saved-searches--lists)
- [Sequences (Outreach Automation)](#sequences-outreach-automation)
- [Apollo API (Programmatic Access)](#apollo-api-programmatic-access)
- [Best Practices & Tips](#best-practices--tips)

---

## What is Apollo.io?

Apollo.io is a sales intelligence and engagement platform. It provides:

- **Contact Database** — 275M+ verified contacts with emails, phone numbers, and social profiles.
- **Company Database** — 73M+ companies with firmographic data (revenue, employee count, industry, tech stack).
- **Search & Filters** — Powerful filtering to build hyper-targeted prospect lists.
- **Sequences** — Automated multi-step email + call + LinkedIn outreach cadences.
- **Enrichment** — Enrich your CRM or CSV with Apollo data.
- **Intent Signals** — See which companies are actively researching topics relevant to your product.

---

## Getting Started

1. **Create an account** at [app.apollo.io](https://app.apollo.io).
2. **Install the Chrome Extension** — Lets you prospect directly from LinkedIn, company websites, and Gmail.
3. **Connect your email** — Go to `Settings → Email Accounts` and connect Gmail / Outlook for sending sequences.
4. **Set up your sender profile** — Add your name, title, and signature under `Settings → Profile`.

---

## People Search & Filters

The People Search is the core of Apollo. Navigate to **Search → People** to access it.

### Quick Filter Bar

At the top you'll see quick-access filters. Click any to expand options:

| Filter | What it does | Example |
|--------|-------------|---------|
| **Job Titles** | Filter by exact title, title keywords, or seniority | `CTO`, `VP of Engineering`, `Head of Product` |
| **Company** | Filter by specific company names | `Stripe`, `Notion`, `Linear` |
| **Location** | Filter by person's location (city, state, country, region) | `San Francisco, CA`, `United States`, `Europe` |
| **# Employees** | Filter by company headcount range | `11-50`, `51-200`, `201-500` |
| **Industry** | Filter by the company's industry classification | `Computer Software`, `SaaS`, `Financial Services` |

### Advanced Filters (Full List)

Click **"More Filters"** to access the full filter panel. Here's every available filter grouped by category:

#### 👤 Person Filters

| Filter | Description | Pro Tips |
|--------|-------------|----------|
| **Job Titles** | Search by exact title or keywords | Use "contains" for broad matching (`Engineer`) or exact for precision (`Staff Software Engineer`) |
| **Seniority** | Filter by level: C-Suite, VP, Director, Manager, Individual Contributor | Stack with Job Title for precision: `Seniority: VP` + `Title contains: Engineering` |
| **Department** | Filter by function: Engineering, Sales, Marketing, Finance, HR, Operations, etc. | Useful when you don't know exact titles |
| **Management Level** | C-Level, VP, Director, Manager, Non-Manager | Alternative to Seniority with different granularity |
| **Person Location** | City, State, Country, Continent | Supports radius search around a city |
| **Email Status** | Verified, Guessed, No Email | Always filter for **Verified** for cold outreach |
| **Phone Number** | Has Direct Dial, Has Mobile, Has Any Phone | Filter for "Has Direct Dial" for cold calling |
| **LinkedIn URL** | Has LinkedIn Profile | Useful for LinkedIn outreach sequences |
| **Years in Current Role** | How long they've been in their current position | `< 1 year` = recently promoted/hired = potential buyer |
| **Years at Current Company** | Tenure at the company | New hires (`< 1 year`) are often building their stack |
| **Last Changed Job** | When they last switched companies | Recent job changers are 3x more likely to buy |

#### 🏢 Company Filters (Applied to Person Search)

| Filter | Description | Pro Tips |
|--------|-------------|----------|
| **Company Name** | Specific company names | Use for ABM (Account-Based Marketing) campaigns |
| **Company Domain** | Filter by website domain | Upload a CSV of target domains |
| **# Employees** | Headcount ranges | `1-10`, `11-50`, `51-200`, `201-500`, `501-1000`, `1001-5000`, `5001-10000`, `10000+` |
| **Revenue** | Annual revenue ranges | `$1M-$10M`, `$10M-$50M`, `$50M-$100M`, etc. |
| **Industry** | NAICS-based industry codes | Can select multiple industries |
| **Keywords** | Company description keywords | `AI`, `machine learning`, `meeting recording` |
| **Technologies** | Tech stack the company uses | `React`, `Kubernetes`, `Salesforce`, `Slack` — great for selling dev tools |
| **Company Location** | HQ location of the company | Different from Person Location! |
| **Founded Year** | When the company was founded | Filter for startups: `2020-2025` |
| **Funding Stage** | Seed, Series A, Series B, Series C+, IPO | `Series A-B` = growing fast, have budget |
| **Total Funding** | Total amount raised | `$5M-$50M` = funded but still agile |
| **Latest Funding Date** | When they last raised | `Last 6 months` = flush with cash |
| **Company Type** | Private, Public, Non-Profit, Government, Education | Most B2B SaaS targets are `Private` |

#### 📊 Intent & Signal Filters

| Filter | Description | Pro Tips |
|--------|-------------|----------|
| **Buying Intent** | Companies showing intent signals for specific topics | Set up intent topics in `Settings → Intent` first |
| **Intent Score** | High / Medium / Low | Focus on **High** intent for warm outreach |
| **Job Postings** | Companies actively hiring for specific roles | If they're hiring engineers → they need dev tools |
| **News & Events** | Recent company news, funding rounds, product launches | Great conversation starters |

---

## How to Build a People Search (Step-by-Step)

### Example: Finding VP+ Engineering Leaders at Funded SaaS Startups in the US

1. Go to **Search → People**
2. Set these filters:

```
Job Title:        contains "Engineering" OR "Technical"
Seniority:        VP, C-Suite, Director
Department:       Engineering
Person Location:  United States
# Employees:      51-500
Industry:         Computer Software, Internet
Funding Stage:    Series A, Series B
Email Status:     Verified
```

3. Review results in the table
4. Click **"Save Search"** to reuse this filter set
5. Select contacts → **"Save to List"** or **"Add to Sequence"**

### Example: Finding Recently-Hired Product Managers at Enterprise Companies

```
Job Title:        contains "Product Manager" OR "Product Lead"
Seniority:        Manager, Director
Years in Role:    < 1 year
# Employees:      1001-10000
Revenue:          $50M+
Email Status:     Verified
```

### Example: Finding CTOs at Companies Using Specific Tech

```
Job Title:        CTO, VP Engineering, Head of Engineering
Technologies:     React, Node.js, AWS
# Employees:      11-200
Funding Stage:    Seed, Series A
Company Location: Europe
```

---

## Company Search & Filters

Navigate to **Search → Companies** to find and filter organizations.

### Available Company Filters

| Filter | Description |
|--------|-------------|
| **Company Name** | Search by name |
| **Domain** | Search by website |
| **Industry** | NAICS industry classification |
| **# Employees** | Headcount range |
| **Revenue** | Annual revenue range |
| **Location** | HQ city, state, country |
| **Keywords** | Terms in company description |
| **Technologies** | Tech stack |
| **Founded Year** | Year of incorporation |
| **Funding** | Stage, amount, and recency |
| **SIC Codes** | Standard Industrial Classification |
| **Alexa Ranking** | Web traffic ranking |
| **Job Postings** | Open positions (by title keyword) |

### Using Company Search for ABM

1. Build a company list with your ICP (Ideal Customer Profile) filters
2. Save the list
3. Switch to **People Search** and use the **"Company Lists"** filter to find contacts *within* those companies
4. Add the right contacts to a Sequence

---

## Saved Searches & Lists

### Saved Searches
- Click **"Save Search"** after configuring filters
- Saved searches are **dynamic** — new contacts matching your criteria are added automatically
- Set up **alerts** to get notified when new matches appear

### Lists
- Lists are **static** snapshots of contacts/companies
- Create lists via **"Save to List"** from search results
- Use lists to:
  - Organize by campaign or segment
  - Feed into Sequences
  - Export as CSV
  - Sync to your CRM

---

## Sequences (Outreach Automation)

Sequences let you automate multi-step outreach campaigns.

### Creating a Sequence

1. Go to **Engage → Sequences**
2. Click **"+ New Sequence"**
3. Add steps:

| Step Type | Description |
|-----------|-------------|
| **Automatic Email** | Sent automatically at the scheduled time |
| **Manual Email** | Queued for your review before sending |
| **Phone Call** | Reminder task to call the contact |
| **LinkedIn Action** | Connect / InMail / View Profile task |
| **Custom Task** | Any custom action (e.g., "Send gift") |

### Sequence Settings

| Setting | Recommendation |
|---------|---------------|
| **Send Window** | Mon-Fri, 8am-6pm (contact's timezone) |
| **Daily Send Limit** | Start at 25/day, ramp to 50-75 over 2 weeks |
| **Reply Handling** | Auto-pause on reply (always enable this) |
| **Bounce Handling** | Auto-remove on bounce |
| **Open/Click Tracking** | Enable for analytics (disable if deliverability issues) |

### Example 4-Step Sequence

```
Day 1  → Automatic Email (intro + value prop)
Day 3  → LinkedIn Connection Request (with note)
Day 5  → Automatic Email (follow-up with case study)
Day 8  → Phone Call Task
Day 10 → Manual Email (breakup email)
```

---

## Apollo API (Programmatic Access)

Apollo offers a REST API for building custom integrations.

### Authentication

```bash
# All requests use an API key via query param or header
curl "https://api.apollo.io/api/v1/mixed_people/search" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_API_KEY" \
  -d '{
    "person_titles": ["CTO", "VP Engineering"],
    "person_locations": ["United States"],
    "organization_num_employees_ranges": ["51,200"],
    "page": 1,
    "per_page": 25
  }'
```

### Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/mixed_people/search` | POST | Search for people with filters |
| `/v1/mixed_companies/search` | POST | Search for companies with filters |
| `/v1/people/match` | POST | Enrich a person by email/name/domain |
| `/v1/organizations/enrich` | GET | Enrich a company by domain |
| `/v1/emailer_campaigns` | GET | List all sequences |
| `/v1/contacts` | POST | Create a contact in Apollo |
| `/v1/email_accounts` | GET | List connected email accounts |
| `/v1/labels` | GET | List all labels/tags |

### API Filter Parameters (People Search)

```json
{
  "person_titles": ["CTO", "VP Engineering"],
  "person_seniorities": ["vp", "c_suite", "director"],
  "person_locations": ["San Francisco, CA"],
  "organization_ids": ["org_abc123"],
  "organization_num_employees_ranges": ["1,50", "51,200"],
  "organization_industry_tag_ids": ["5567cd..."],
  "q_keywords": "machine learning",
  "prospected_by_current_team": ["no"],
  "contact_email_status": ["verified"],
  "page": 1,
  "per_page": 25
}
```

### API Filter Parameters (Company Search)

```json
{
  "organization_industry_tag_ids": ["..."],
  "organization_num_employees_ranges": ["51,200"],
  "organization_revenue_ranges": ["1000000,10000000"],
  "organization_locations": ["United States"],
  "q_organization_keyword_tags": ["SaaS", "AI"],
  "organization_latest_funding_stage_cd": ["a", "b"],
  "page": 1,
  "per_page": 25
}
```

---

## Best Practices & Tips

### 🎯 Targeting

- **Layer filters** — Don't just search by title. Combine title + seniority + company size + funding + tech stack for laser-focused lists.
- **Use "Exclude" filters** — Exclude companies you've already contacted, competitors, or unqualified industries.
- **Filter for Verified Emails** — Always set `Email Status: Verified` for cold email. Guessed emails tank deliverability.
- **Job change signals** — People who recently changed jobs are 3x more likely to evaluate new tools. Use `Years in Current Role: < 1 year`.

### 📧 Outreach

- **Warm up your email** — Send 10-15 emails/day for the first 2 weeks before ramping up.
- **Personalize** — Use Apollo's `{{variables}}` like `{{first_name}}`, `{{company}}`, `{{title}}` in sequences.
- **A/B test subject lines** — Apollo supports A/B testing on email steps. Always test.
- **Keep sequences short** — 3-5 touches over 10-14 days. Don't spam.
- **Use manual email steps** for high-value prospects so you can customize each message.

### 📊 Tracking

- **Monitor sequence analytics** — Open rate, reply rate, bounce rate, and meeting booked rate.
- **Healthy benchmarks:**
  - Open rate: 50%+
  - Reply rate: 5-15%
  - Bounce rate: < 3%
- **Pause sequences** with high bounce rates immediately — it kills your sender reputation.

### 🔄 CRM Integration

- Apollo integrates with **Salesforce**, **HubSpot**, and others.
- Enable **2-way sync** to keep Apollo and your CRM in sync.
- Use **"Do Not Contact"** lists to respect opt-outs and stay compliant.

### ⚡ Power User Shortcuts

| Shortcut | Description |
|----------|-------------|
| `Cmd/Ctrl + K` | Quick search (search anything in Apollo) |
| Bulk select + "Add to Sequence" | Add hundreds of contacts to a sequence at once |
| CSV Import → Enrich | Upload a CSV of names/domains and Apollo fills in emails & data |
| Chrome Extension on LinkedIn | Click the Apollo icon on any LinkedIn profile to get their email |

---

## Credit Usage

Apollo uses a credit system. Be aware of costs:

| Action | Credits |
|--------|---------|
| **Reveal Email** | 1 credit |
| **Reveal Mobile Number** | 5 credits |
| **Export Contact** | 1 credit |
| **API Enrichment** | 1 credit per record |

> **Tip:** Use filters aggressively to narrow your list *before* revealing emails. Don't burn credits on unqualified leads.

---

## Useful Links

- [Apollo.io App](https://app.apollo.io)
- [Apollo API Docs](https://apolloio.github.io/apollo-api-docs/)
- [Apollo Knowledge Base](https://knowledge.apollo.io)
- [Apollo Chrome Extension](https://chrome.google.com/webstore/detail/apollo-io/eikcnfddocefiocjgkpkecfgelfdaplj)
