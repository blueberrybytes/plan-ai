---
layout: home
hero:
  name: "Plan AI"
  text: "The Bot-Free AI Context Engine"
  tagline: "Stop burning thousands on TPM overhead. Turn your engineering meetings into perfectly scoped Jira tickets, architecture diagrams, and system docs—automatically."
  image:
    src: /logos/android-chrome-512x512.png
    alt: Plan AI
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/introduction
    - theme: alt
      text: View on GitHub
      link: https://github.com/blueberrybytes/plan-ai
features:
  - title: Bot-Free Native Recording
    details: Securely record locally via our native macOS and Windows apps. Never invite a creepy bot to your client Zoom calls again.
    icon: 🎙️
  - title: Bring Your Own Key (BYOK)
    details: Complete privacy and wholesale AI pricing. Plug in your OpenRouter and Deepgram keys to avoid SaaS markup and token taxes.
    icon: 🔑
  - title: 1-Click Ticket Generation
    details: Connect to Jira or Linear. Automatically generate perfectly scoped technical tasks with exact acceptance criteria based on the meeting audio.
    icon: 🎫
  - title: Automated System Docs
    details: Stop writing documentation manually. Plan AI extracts architectural decisions and system changes directly from your engineering standups.
    icon: 📄
  - title: Context-Aware Chat
    details: Instantly query an LLM that actually understands your business. The chat is fully grounded in your provided codebase and past meetings.
    icon: 💬
  - title: Open Core Architecture
    details: Built on a robust, type-safe monorepo. Self-host it on your own infrastructure or use our managed B2B service for zero hassle.
    icon: 🏗️
---

<br><br>

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
