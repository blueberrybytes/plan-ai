# Open Source Viral Strategy: Plan AI 🚀

As the CEO of an AI company, you have a unique advantage: you can speak to the **business value** and **technical architecture** simultaneously. Your audience includes other founders, CTOs, and developers who feel the pain of expensive SaaS and data privacy issues. 

Here is a comprehensive playbook to make **Plan AI** go viral on open-source channels and leverage your personal LinkedIn profile.

---

## 1. Core Narrative & Positioning
You are not just launching a "free tool". You are commoditizing a deeply necessary enterprise workflow. 
**Positioning:** "The Open Source, Bring-Your-Own-Key (BYOK) alternative to Otter.ai and Fireflies."

### The 3 Pillars of Your Message
1. **Data Sovereignty:** Enterprise meeting recordings are highly sensitive. You shouldn't send your product roadmaps and sales calls to third-party SaaS platforms to train their models.
2. **Cost-Efficiency (BYOK):** Paying $20/user/mo across a 100-person company is $24k/year just for note-taking. With Plan AI, you run your own infrastructure and only pay fractions of a cent for the API calls.
3. **The Complete Ecosystem:** This isn't just a web wrapper. Plan AI is an entire monorepo featuring a Web Dashboard, a Mobile App for in-person meetings, and an Electron Desktop App for virtual calls (Zoom, Meet, Teams).

---

## 2. LinkedIn Post Strategy (The "Viral" Series)

Don't launch it all at once. Build a narrative over 4-5 days.

### Post 1: The Frustration & The Drop (Launch Day)
**Trigger:** Cost & Privacy.
* **The Hook:** "I was tired of paying thousands of dollars for AI meeting recorders that hallucinate and own my company's sensitive data. So we built our own, and today I'm open-sourcing the entire codebase."
* **The Body:** Mention the problem (SaaS per-seat pricing is a scam for AI wrappers). Highlight that you built a monorepo that solves this locally: Web, Mobile (React Native), and Desktop (Electron). Mention "Bring Your Own Key" (BYOK).
* **The Call to Action (CTA):** "Check out the GitHub repo here. If you hate per-seat AI pricing, give it a star ⭐!"
* **Media:** A high-quality screenshot of the web dashboard or a 10-second GIF of it working.

### Post 2: The "Show, Don't Tell" (Day 2)
**Trigger:** Immediate gratification & Utility.
* **The Hook:** "Here is exactly how our open-source meeting recorder extracts action items from a 30-minute Zoom call in 5 seconds."
* **The Body:** Focus on the Desktop App (`plan-ai-recorder`). Explain how it grabs system audio directly, bypassing the need for "bot participants" that join your Zoom calls (people hate those bots!).
* **The CTA:** "The desktop app is built on Electron and React. Repo link in the comments."
* **Media:** A slick 45-60 second Loom video showing a mock meeting and the instantaneous generated notes.

### Post 3: The Architecture Deep Dive (Day 4)
**Trigger:** Technical curiosity (attracts engineers who will star/fork).
* **The Hook:** "Building an AI meeting assistant isn't just a web app. It's a massive orchestration problem. Here is the architecture behind Plan AI."
* **The Body:** Talk about the stack. Express backend, Postgres, Qdrant (Vector DB) for RAG, BullMQ/Redis for async transcription queues, and 3 different frontends.
* **The CTA:** "We designed this for scale. Developers, tear it apart and tell me what we can improve. Repo below."
* **Media:** A clean Mermaid.js diagram or an Excalidraw sketch of the system architecture.

### Post 4: The Mobile Companion (Day 6)
**Trigger:** Offline/In-person utility.
* **The Hook:** "Most AI meeting tools ignore the most important meetings: the ones that happen in person."
* **The Body:** Showcase `plan-ai-mobile`. "We built a React Native app so you can record live whiteboarding sessions and investor meetings right from your pocket, syncing instantly to the web dashboard."
* **Media:** A mockup/screenshot of the mobile app interface.

---

## 3. Pains & Triggers to Exploit

Use these specific phrases to agitate the market:
* **The "Spy" Bot:** "Everyone hates when an Otter bot suddenly joins their private Zoom call. Plan AI records system audio natively—no awkward bot participants."
* **The Data Harvesting:** "Are your confidential board meetings being used to train the next version of a VC-funded startup's LLM? Own your data."
* **The AI Tax:** "AI shouldn't be a $20/month per-seat subscription. It's an infrastructure layer. BYOK (Bring Your Own Key) is the future of enterprise software."

---

## 4. Where to Share for Free (Testing the Waters)

To get those initial GitHub stars (which drives algorithmic trending), seed the project here:

### Developer & Open Source Communities
1. **Hacker News (Y Combinator):** 
   - Post as a `Show HN:`. Title: *Show HN: Plan AI – Open-source alternative to Otter/Fireflies with Desktop & Mobile apps*.
   - **Crucial:** Write a thoughtful first comment explaining *why* you built it as the CEO of an AI company.
2. **Reddit:**
   - **r/selfhosted:** (Huge audience for BYOK and data-privacy tools). Title: *I built a self-hosted alternative to Fireflies.ai with a Qdrant Vector DB and Desktop/Mobile apps*.
   - **r/OpenSource:** Share the repository.
   - **r/SideProject:** Showcase the video demo.
   - **r/reactjs & r/reactnative:** Focus purely on the monorepo architecture and how you share types via OpenAPI/TSOA between Web, Mobile, and Desktop.

### Tech & Product Channels
3. **Product Hunt:**
   - Launch it specifically as an "Open Source Developer Tool". Make sure to have a good logo and a solid 1-minute explainer video.
4. **X (Twitter):**
   - Do a "Build in Public" thread. Tag accounts like `@LangChainAI` (if you use them), or vector DBs like `@qdrant_engine`—they love retweeting projects that use their tech.

### Specialized AI Communities
5. **Discord Servers:**
   - Share in the "Showcase" channels of large AI discords (e.g., LangChain, LlamaIndex, OpenAI developer community, LocalLLaMA).

---

## Action Items for Today
1. Ensure the `README.md` is spectacular. It must have architecture diagrams, easy `docker-compose` or `yarn dev` instructions, and a feature checklist.
2. Record the 60-second Loom video demonstrating the Desktop Recorder in action.
3. Draft "Post 1" for LinkedIn and prepare your network (ask a few close colleagues to engage with the post in the first 30 minutes to boost the algorithm).
