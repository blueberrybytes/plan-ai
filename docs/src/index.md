---
layout: home
hero:
  name: "Plan AI"
  text: "Private AI for your engineering meetings."
  tagline: "Plan AI records your meetings and turns them into tickets, specs and diagrams. Recordings and files are private by default. For confidential work, the whole AI stack runs on your own servers and no meeting content reaches an AI provider."
  image:
    src: /logos/android-chrome-512x512.png
    alt: Plan AI
  actions:
    - theme: brand
      text: Security Overview
      link: /security/overview
    - theme: alt
      text: Who is this for?
      link: /getting-started/who-its-for
    - theme: alt
      text: Get Started
      link: /getting-started/introduction
    - theme: alt
      text: View on GitHub
      link: https://github.com/blueberrybytes/plan-ai
features:
  - title: AI on Your Own Servers
    details: With a private install, transcription, speaker identification, the language model and search run on your infrastructure. No meeting content goes to OpenAI, Deepgram or any other AI provider.
    link: /self-hosting/private-stack
    icon: 🖥️
  - title: Private by Default
    details: Recordings, voice profiles and files are never public. Every read goes through a signed link that expires within 1 to 12 hours.
    link: /security/data-storage
    icon: 🔒
  - title: Shared Only on Purpose
    details: Meeting documents and slides stay inside your workspace. You share one when you decide to, and you can stop sharing at any moment.
    link: /security/overview
    icon: 🔗
  - title: No Bots in Your Calls
    details: Native recorders for macOS, Windows, iOS and Android. No bot joins the call, and a pause means that part is never captured.
    icon: 🎙️
  - title: Your Own AI Keys
    details: On the cloud version, bring your own OpenRouter and Deepgram keys. The AI runs under your accounts and your agreements with those providers.
    link: /security/byok-architecture
    icon: 🔑
  - title: Code-Aware Tickets and Specs
    details: Plan AI reads your repo graph before writing a ticket. Tickets come with acceptance criteria and links to real files, and specs are ready to share with clients.
    icon: 🎫
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
