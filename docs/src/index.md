---
layout: home
hero:
  name: "Plan AI"
  text: "Standups in. Jira tickets out."
  tagline: "The AI meeting assistant for software teams. Record your engineering meetings, understand your codebase via a code graph, and ship proper tickets, specs, and architecture diagrams — automatically."
  image:
    src: /logos/android-chrome-512x512.png
    alt: Plan AI
  actions:
    - theme: brand
      text: Who is this for?
      link: /getting-started/who-its-for
    - theme: alt
      text: Get Started
      link: /getting-started/introduction
    - theme: alt
      text: View on GitHub
      link: https://github.com/blueberrybytes/plan-ai
features:
  - title: Bot-Free Native Recording
    details: Native macOS, Windows, iOS and Android recorders. Your client calls stay on your machine, not on a Fathom server. Zoom, Meet, and in-person — all covered.
    icon: 🎙️
  - title: Code-Aware Ticket Generation
    details: Plan AI reads your repo graph via Plan Cortex before writing a ticket. Properly scoped tickets with acceptance criteria, story points, and links to real files in your codebase.
    icon: 🎫
  - title: Bring Your Own Key (BYOK)
    details: €6/seat with your OpenRouter + Deepgram keys, or €29/seat fully managed. No hidden token taxes, no per-message anxiety.
    icon: 🔑
  - title: Automated Specs & Docs
    details: Plan AI extracts architectural decisions, system changes, and acceptance criteria from your engineering standups and design reviews — ready to share with clients or paste into Notion.
    icon: 📄
  - title: Codebase + Meeting RAG
    details: Ask "why did we build it this way?" and get a real answer grounded in past standups, design reviews, and the current state of your code. Connect GitHub, internal docs, anything.
    icon: 💬
  - title: Open Core, Self-Hostable
    details: Built on a type-safe TypeScript monorepo. Self-host it on your own infrastructure or use our managed cloud. Same product either way.
    icon: 🏗️
---

<br><br>

<div style="text-align: center; max-width: 1000px; margin: 0 auto; padding: 2rem 0;">
  <h2 style="font-size: 2.5rem; font-weight: 700; margin-bottom: 1rem; letter-spacing: -0.02em;">Sneak Peek</h2>
  <div style="display: flex; justify-content: space-between; gap: 15px; margin-bottom: 3rem; text-align: left;">
    <div style="width: 32%; display: flex; flex-direction: column; gap: 10px;">
      <img src="/images/recorder.png" style="width: 100%; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" alt="Native Recorder" />
      <h3 style="margin: 0; font-size: 1.1rem; font-weight: 600;">1. Native Recorder</h3>
      <p style="margin: 0; font-size: 0.9rem; color: var(--vp-c-text-2);">Securely capture your meetings without invasive bots. Start recording instantly from your desktop or mobile app.</p>
    </div>
    <div style="width: 32%; display: flex; flex-direction: column; gap: 10px;">
      <img src="/images/recording.png" style="width: 100%; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" alt="Live Meeting Assistant" />
      <h3 style="margin: 0; font-size: 1.1rem; font-weight: 600;">2. Live Meeting Assistant</h3>
      <p style="margin: 0; font-size: 0.9rem; color: var(--vp-c-text-2);">While recording, you can swap the AI's context on the fly, read real-time summaries, and ask the live chat questions.</p>
    </div>
    <div style="width: 32%; display: flex; flex-direction: column; gap: 10px;">
      <img src="/images/tasks.png" style="width: 100%; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" alt="Generated Tasks" />
      <h3 style="margin: 0; font-size: 1.1rem; font-weight: 600;">3. Automated Tasks</h3>
      <p style="margin: 0; font-size: 0.9rem; color: var(--vp-c-text-2);">Once the meeting ends, Plan AI instantly generates perfectly scoped engineering tickets and actionable items based on the discussion.</p>
    </div>
  </div>
</div>

<div style="text-align: center; max-width: 900px; margin: 0 auto; padding: 2rem 0;">
  <h2 style="font-size: 2.5rem; font-weight: 700; margin-bottom: 1rem; letter-spacing: -0.02em;">The Wedge Workflow</h2>
  <p style="color: var(--vp-c-text-2); margin-bottom: 3rem; font-size: 1.125rem;">Stop writing manual acceptance criteria. Let the context engine do the heavy lifting.</p>
  
```mermaid
graph LR
    %% Styles
    classDef meeting fill:#161920,stroke:#4361EE,stroke-width:2px,color:#fff,rx:10px,ry:10px,padding:20px;
    classDef engine fill:#161920,stroke:#a78bfa,stroke-width:2px,color:#fff,rx:10px,ry:10px,padding:20px;
    classDef action fill:#4361EE,stroke:none,color:#fff,rx:10px,ry:10px,padding:20px;
    
    A[🎙️ 1. Record Meeting<br><span style='font-size:12px;color:#94a3b8'>Bot-Free Desktop App</span>]:::meeting --> B
    
    B(🧠 2. Context Engine<br><span style='font-size:12px;color:#94a3b8'>Cross-references Codebase</span>):::engine
    
    B --> C[🎫 3. Push to Jira<br><span style='font-size:12px;color:#94a3b8'>Perfectly Scoped Tickets</span>]:::action
```
</div>

<div style="text-align: center; max-width: 1000px; margin: 0 auto; padding: 2rem 0;">
  <h2 style="font-size: 2.5rem; font-weight: 700; margin-bottom: 1rem; letter-spacing: -0.02em;">Bridging Tech & Non-Tech (AI RAG)</h2>
  <p style="color: var(--vp-c-text-2); margin-bottom: 3rem; font-size: 1.125rem;">Plan AI isn't just a meeting transcriber; it's a context bridge between Product Managers and AI Coding Assistants.</p>

  <div style="display: flex; justify-content: space-between; gap: 15px; margin-bottom: 3rem; text-align: left;">
    <div style="width: 32%; display: flex; flex-direction: column; gap: 10px;">
      <h3 style="margin: 0; font-size: 1.1rem; font-weight: 600;">📦 Repomix Integration</h3>
      <p style="margin: 0; font-size: 0.9rem; color: var(--vp-c-text-2);">We bundle your entire monorepo into a single, AI-optimized markdown file, allowing Cursor or Cline to ingest context instantly.</p>
    </div>
    <div style="width: 32%; display: flex; flex-direction: column; gap: 10px;">
      <h3 style="margin: 0; font-size: 1.1rem; font-weight: 600;">🧠 Semantic Memory (Qdrant)</h3>
      <p style="margin: 0; font-size: 0.9rem; color: var(--vp-c-text-2);">Meeting transcripts are chunked and vectorized, creating a long-term semantic memory of every architectural decision.</p>
    </div>
    <div style="width: 32%; display: flex; flex-direction: column; gap: 10px;">
      <h3 style="margin: 0; font-size: 1.1rem; font-weight: 600;">🔍 Plan Cortex</h3>
      <p style="margin: 0; font-size: 0.9rem; color: var(--vp-c-text-2);">We ship with a native Model Context Protocol (MCP) server that maps out the codebase graph to avoid AI hallucinations.</p>
    </div>
  </div>
</div>
