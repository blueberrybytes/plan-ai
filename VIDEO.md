# Plan AI — Product Video Script

**Target Audience:** Engineering Managers, Tech Leads, TPMs, software agency owners — technical decision-makers.
**Core Message:** The AI meeting assistant that actually understands your codebase and ships engineering deliverables (tickets, docs, diagrams, slides) — not just summaries.
**The Wedge (lead with this):** Bot-free local recording → properly scoped Jira / Linear tickets in minutes.
**Estimated Length:** 60–75 seconds.
**Vibe:** Fast-paced, technical but accessible. A technical founder showing other technical leaders a real workflow.

> **How this doc works:** each scene is tagged either **🎥 RECORD REAL PRODUCT** (film the actual app — never AI-generate UI) or **🤖 AI VIDEO** (generate with Google's omni / Veo model — a copy-paste prompt sits right under the scene). Some scenes are mixed.
>
> **⏱️ 8-second cap:** Google's video model generates **max ~8 seconds per clip**. Any AI segment longer than 8s is split into numbered clips (**1A, 1B, …**) that you stitch together in the edit. Every prompt below states its clip length and stays ≤ 8s.
>
> **Accuracy note:** every product claim is backed by a real, shippable feature (see the Verified Shot List at the bottom). Don't add claims beyond these — the product doesn't hallucinate, and neither should the video.
>
> **Brand look (already baked into every AI prompt):** deep charcoal `#18181B`, electric blue `#4361EE`, lavender-purple `#a78bfa`, crisp white. Sleek dark-mode, cinematic, photoreal.

---

## Scene 1 — The Pain & The ROI Hook (0:00 – 0:12)
**Visual:** Founder direct-to-camera *(optional)*, intercut with b-roll of an overwhelmed engineer, a half-empty Jira board, a Slack ping.
**Voiceover / On-camera:**
"If you run a software team, you're paying senior engineers to sit in a sync — and then paying *again* to translate that hour into Jira tickets, specs, and diagrams, from memory. That's the most expensive copy-paste job in tech."

> **🤖 AI VIDEO — Scene 1 = 12s, so 2 clips (Veo caps at 8s each):**
>
> **▶ Clip 1A (0:00–0:07, ~7s) — the overwhelmed engineer:**
> *Cinematic premium B2B tech look. Deep charcoal near-black office (#18181B), lit only by the cool blue (#4361EE) glow of an off-screen monitor reflecting on a focused software engineer's face, with subtle lavender-purple (#a78bfa) rim light. Late evening, sticky notes around them. The engineer leans back, rubs their temples and exhales, quietly overwhelmed after a long meeting. Shallow depth of field, soft volumetric light, subtle film grain, slow push-in on their tired expression. Photoreal, premium, melancholic-but-clean mood. No text, no logos, no software UI or readable screens. Ambient room tone only, no dialogue. 16:9, 7 seconds.*
>
> **▶ Clip 1B (0:07–0:12, ~5s) — "the expensive copy-paste" concept:**
> *Abstract conceptual macro shot, cinematic premium tech look on a deep charcoal (#18181B) void. A glowing hourglass made of soft electric-blue (#4361EE) light slowly drains while faint lavender-purple (#a78bfa) particle streams drift away and dissolve into the dark — symbolizing wasted billable hours. Soft bokeh, shallow depth of field, slow elegant motion, gentle bloom, subtle film grain. Photoreal. No text, no logos, no UI. Soft ambient tone only, no dialogue. 16:9, 5 seconds.*

---

## Scene 2 — The Hook & Introduction (0:12 – 0:20)
**Visual:** Abstract brand-reveal wipe → bold text **Plan AI** (added in edit) → cut to the macOS menu-bar Recorder, one click → "Record". No bot joins the call.
**Voiceover:**
"Meet Plan AI. Not another meeting transcriber — the AI workspace built for software teams. And notice what *didn't* happen: no creepy bot joined the call. The audio is captured locally, on your Mac."

> **🤖 AI VIDEO — ▶ Clip 2T (transition only, ~2s):**
> *Sleek abstract energy-wipe transition. A single beam of electric-blue (#4361EE) light sweeps left-to-right across a deep charcoal (#18181B) frame, leaving a clean lavender-to-blue (#a78bfa → #4361EE) gradient glow in its wake, like a premium interface powering on. Smooth fast-but-elegant motion, light streaks with subtle motion blur, soft bloom. Photoreal sci-fi-tech feel, cinematic. No text, no logo, no UI. Silent / soft whoosh ambient. 16:9, 2 seconds.*

> **🎥 RECORD REAL PRODUCT:** the macOS menu-bar Recorder and the "Record" click are **real screen footage** — do not AI-generate.

---

## Scene 3 — The Wedge: Recording → Tickets (0:20 – 0:35)
**Voiceover:**
"I just finished a 30-minute client sync. With one click, Plan AI pulls out the technical requirements and writes properly scoped tickets — real acceptance criteria, story points — then pushes them straight to Jira or Linear. In minutes, not days."

> **🎥 RECORD REAL PRODUCT (no AI):** Stop the recording → web dashboard → transcript appears → scoped tickets generate (title, description, **acceptance criteria as a checklist**, story points). **Zoom in** so the criteria are legible on mobile. Show the Jira/Linear push. This is the proof shot — it must be the real app.

---

## Scene 4 — Why It's Different: Code Context (0:35 – 0:48)
**Voiceover:**
"Generic AI doesn't know your codebase. Plan AI does. Through GitNexus, it reads your code graph — your functions, your architecture, your repos. So when the meeting says 'the auth service,' the AI knows exactly what that means, and grounds every ticket and doc in your actual code."

> **🎥 RECORD REAL PRODUCT (no AI):** split screen — transcript mentioning `verifyToken` / the auth service, plus the GitNexus code graph and the **Contexts** tab where repos/architecture docs are attached.

> **🤖 AI VIDEO — ▶ Clip 4 (optional concept cutaway, ~5s):**
> *yToken. 16:9, 5 seconds.*

---

## Scene 5 — The Deliverables (0:48 – 1:00)
**Voiceover:**
"From one conversation: scoped tickets, technical docs, architecture diagrams, branded slides — and a chat that can answer questions about any past meeting. All grounded in your real architecture. No generic AI filler."

> **🎥 RECORD REAL PRODUCT (no AI):** rapid punchy cuts of real outputs — (1) a scoped Linear/Jira ticket with checklist criteria, (2) an auto-generated Mermaid architecture/dependency diagram, (3) a formatted markdown doc, (4) branded PowerPoint slides, (5) the chat answering a question about a past meeting.

---

## Scene 6 — Multi-platform & BYOK Pricing (1:00 – 1:10)
**Voiceover:**
"Record virtual calls natively on Mac, or use the mobile app for in-person whiteboard sessions. And the pricing is honest: a flat per-seat price with **zero per-token AI markup**. On Bring-Your-Own-Key, you plug in your own OpenRouter and Deepgram keys — or go fully Managed and we handle it."

> **🎥 RECORD REAL PRODUCT (no AI):** mobile app recording an in-person whiteboard session, then the pricing/settings screen showing the BYOK key fields (OpenRouter + Deepgram).
>
> *Optional:* if you want an establishing b-roll shot of someone at a whiteboard before cutting to the real mobile app, use the prompt below — but the app screen itself must be real.

> **🤖 AI VIDEO — ▶ Clip 6 (optional establishing shot, ~4s):**
> *Cinematic premium tech look. A small team at a glass whiteboard in a modern dim office, sketching architecture diagrams, lit with cool blue (#4361EE) and soft lavender (#a78bfa) accent light against a charcoal (#18181B) backdrop. A hand holds up a phone as if recording the session (phone screen NOT visible/readable). Shallow depth of field, slow gentle dolly, soft volumetric light, subtle grain, photoreal. No text, no logos, no readable screens. Ambient room tone only. 16:9, 4 seconds.*

---

## Scene 7 — Outro & Call to Action (1:10 – 1:18)
**Visual:** Plan AI logo + text **"From conversation to deliverable in minutes, not days."** + URL `plan-ai.blueberrybytes.com` (all added in edit).
**Voiceover:**
"Stop writing tickets from memory. Get your team back to shipping code. Try Plan AI today."

> **🤖 AI VIDEO — ▶ Clip 7 (backdrop behind the logo, ~5s):**
> *Cinematic premium tech look. A calm, modern, softly-lit engineering workspace at golden-blue hour; a small focused team works productively and relaxed, warm tone with cool blue (#4361EE) and lavender (#a78bfa) ambient accent lighting against charcoal (#18181B). Gentle slow dolly across the room, shallow depth of field, hopeful confident mood — a team unburdened, back to building. Leave clean empty negative space in the center/upper frame for a logo and text to be composited in editing. Photoreal. No on-screen text, logos, or UI. Soft ambient music-friendly room tone. 16:9, 5 seconds.*

---

## ✅ Verified Shot List (the REAL screens to film — every product claim maps to one)
| Scene | Claim | Real feature / where to film it |
|------|-------|----------------------------------|
| 2 | Bot-free local Mac recording | Desktop Recorder (Electron, `plan-ai-recorder`) — menu bar → Record |
| 3 | One-click scoped tickets w/ acceptance criteria + story points | Recording/Transcript detail → generated tasks (criteria render as a checklist) |
| 3 | Push to Jira / Linear | Generation toggles: `syncToJira`, `syncToLinear` (also Trello, Notion, Asana) |
| 4 | Code-graph context | GitNexus via `mcpClientService` + the **Contexts** tab (attach repos/docs) |
| 5 | Architecture / dependency diagram | Mermaid (`Diagrams.tsx`, `MermaidRenderer`) |
| 5 | Technical markdown doc | `docGenerationService` → Doc view |
| 5 | Branded PowerPoint slides | `slideGenerationService` (`pptxgenjs`) → slides preview/export |
| 5 | Chat over past meetings | `chatService` → meeting chat thread |
| 6 | Mobile in-person recording | `plan-ai-mobile` (Expo) |
| 6 | BYOK keys | Workspace settings → OpenRouter + Deepgram key fields |

## ⚠️ Do NOT say (inaccurate / will get fact-checked)
- ❌ "Instantly" — processing a real meeting takes ~**40s to 5 min**. Say **"in minutes."**
- ❌ "Pay only for what you use" — pricing is **flat per-seat** (BYOK ~€6, Managed ~€29). Say **"flat per-seat, no per-token markup."**
- ❌ "Free" / "free trial" — there is **no free tier**. It's paid-only.
- ⚠️ "Open source" — the license is **BUSL-1.1 (source-available**, converts to AGPL in 2030). Safer phrasing: **"open-core, self-hostable."**

## 🤖 AI b-roll rules (read before generating)
- **Never** let the AI generate fake product UI, dashboards, Jira/Linear boards, code, or readable text — it looks fake and kills trust. Real screens = real recordings (the 🎥 scenes above).
- Generate **3–5 second** clips; expect to run each prompt 2–4 times and pick the cleanest take.
- Generate **16:9** for the master cut; re-generate **1:1** for LinkedIn (subjects sit more center-frame). Add all text/logos/URLs in editing, not via AI.
- **Mute the AI's generated audio** — your voiceover + music track owns the sound.
- Keep motion direction consistent with your edit (e.g., the Scene 2 wipe should flow into the next cut).

## 🎬 Production Notes
- **First 3 seconds:** lead with the ROI/pain hook ("If you run a software team…"), not "Hi, I'm Xavi." Decision-makers scroll fast.
- **Zoom + highlight** the generated acceptance criteria (Scene 3) so they're legible on muted mobile feeds — this is the "WOW" proof moment.
- **Audio is non-negotiable** for B2B conversion — dedicated lapel/shotgun mic.
- **Subtitles:** high-contrast, bold, centered/lower-third — many watch LinkedIn on mute.
- **Aspect ratios:** 16:9 master (landing page hero, YouTube, X) + a 1:1 square cut (LinkedIn feed). Skip pure 9:16 unless you make a separate Reels/Shorts edit with aggressive zoom on single UI elements.
- **Two valid cuts:** (a) founder on-camera for authority + screen-share B-roll, or (b) pure voiceover over screen + AI b-roll. The script works for both.
