# What is Plan AI?

Plan AI is an open-source, AI-assisted meeting planning and execution platform designed specifically for software agencies, engineering teams, and Technical Project Managers (TPMs). 

[![Plan AI Demo](https://img.youtube.com/vi/qJBdLCjMD28/maxresdefault.jpg)](https://www.youtube.com/watch?v=qJBdLCjMD28)

Unlike generic consumer chatbots, Plan AI is a **contextual engine** that connects your codebases, your tracking boards, and your private meetings to automate the most tedious parts of software development.

::: info Try it immediately
Don't want to self-host or mess with Docker? You can use our fully managed, securely hosted cloud platform. Just head over to **[plan-ai.blueberrybytes.com](https://plan-ai.blueberrybytes.com)**, plug in your BYOK API keys, and start recording in 2 minutes.
:::

## The Wedge: Meeting to Ticket
The core value proposition of Plan AI is ruthless efficiency. 

If you manage a software team, you're wasting thousands of dollars a month paying project managers to manually turn meeting notes into Jira tickets. Plan AI solves this by introducing a "Wedge" workflow:
1. **Record:** You securely record your client syncs locally on your machine.
2. **Contextualize:** The system processes the audio alongside your specific technical architecture and codebase.
3. **Execute:** With one click, Plan AI generates perfectly scoped Jira, Linear, Trello, or Notion tickets with exact acceptance criteria, preventing generic AI hallucinations.

## Why Bot-Free?
Most AI meeting tools invite a "creepy bot" to your Zoom, Google Meet, or Teams calls. This is a massive red flag for enterprise clients and B2B software agencies discussing proprietary code, NDA-protected architectures, or unreleased features.

Plan AI is **100% Bot-Free**. 

Our native macOS and Windows desktop applications capture the system audio directly from your soundcard. The client never sees a bot, the meeting is never interrupted, and the recording happens completely invisibly on your local machine.

## The Bring Your Own Key (BYOK) Architecture
We don't believe in locking your data into a proprietary AI subscription, nor do we believe in charging you a "per-message token tax" every time you want to transcribe a meeting.

Plan AI uses a **Bring Your Own Key (BYOK)** architecture. You simply plug in your own API keys for:
*   **Deepgram:** For blazing fast, perfectly accurate audio transcription.
*   **OpenRouter:** To access any LLM you want (Claude 3.5 Sonnet, GPT-4o, Llama 3) for intelligence and ticket generation.

You only pay the raw wholesale cost of the AI providers. Your API keys are securely stored per-workspace and never shared globally.

---

## The 3-Part Ecosystem

Plan AI is built as a unified monorepo consisting of three core applications that work together seamlessly:

### 1. The Web Platform
The central hub where your TPMs and engineers manage workspaces, define "Contexts", review transcripts, chat with the AI, and instantly push tickets to Jira, Linear, Trello, or Notion. Import documents from Google Drive or export artifacts to Microsoft OneDrive.

### 2. The Native Desktop Recorder
A lightweight, secure Electron application that lives in your menu bar (macOS, Windows, Linux). It captures your microphone and system audio without ever inviting a bot to the call.

### 3. The Mobile App
A React Native companion app for iOS and Android, designed for capturing in-person standups, whiteboarding sessions, or quick voice memos when you are away from your desk.
