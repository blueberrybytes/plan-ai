# Plan AI — Product Bible

> **Last updated:** May 2025
>
> This document is a comprehensive reference for Gemini and other AI assistants. It describes **what Plan AI is**, every feature it offers, its architecture, competitive landscape, and positioning. Use this to inform go-to-market strategy, ICP analysis, pricing, and feature prioritization conversations.

---

## 1. What is Plan AI?

**Plan AI** is an AI-native workspace that closes the loop between **meetings → knowledge → action → deliverables**. It records and transcribes meetings (on desktop, mobile, or web), extracts tasks and insights using AI, organizes everything into projects with their own knowledge bases, and generates polished documents, branded presentations, and diagrams — all from a single platform.

Unlike point solutions that only transcribe (Otter, Fireflies) or only manage tasks (Linear, Asana), Plan AI is a **full-cycle productivity platform** where the output of one workflow feeds the next. A meeting recording becomes a transcript, the transcript becomes tasks, the tasks feed project context, and the context powers the next AI interaction.

### Core Value Proposition

> **"From conversation to deliverable in minutes, not days."**

- Record a meeting → AI transcribes it, extracts action items, generates a project update doc, and syncs tasks to Jira — automatically.
- Ask the AI assistant to "create a presentation about Q2 progress" and it pulls from your meeting history, project files, and task boards to produce branded slides.
- Every interaction makes the system smarter. Uploaded files, past transcripts, and scraped websites form a growing **project knowledge base** that improves transcription accuracy and AI responses.

### BYOK Architecture (Bring Your Own Key)

Plan AI uses a **BYOK model** for all AI processing. Users provide their own:
- **OpenRouter API Key** — for LLM inference (supports GPT-4o, Claude, Gemini, Llama, etc. via OpenRouter's unified API)
- **Deepgram API Key** — for real-time and batch speech-to-text

This means:
- **No per-seat AI markup** — users pay directly at cost to the providers
- **Model flexibility** — users choose which LLM to use per workspace
- **Data sovereignty** — API calls go directly to the chosen providers; Plan AI doesn't store or relay raw audio/text through its own AI infrastructure
- **Transparent pricing** — the platform tracks token usage per workspace with monthly limits and analytics

---

## 2. Platform Architecture

Plan AI is a **monorepo** containing three frontend applications and one backend, all connected:

### 2.1 Core Web Application (`plan-ai`)
- **Frontend:** React (TypeScript) on port 3000
- **Backend:** Node.js / Express on port 8080
- **Database:** PostgreSQL via Prisma ORM
- **Vector DB:** Qdrant for semantic search over transcripts and documents
- **Message Queue:** BullMQ + Redis for async processing (transcription, AI task extraction, document generation)
- **API Layer:** TSOA for type-safe OpenAPI controllers; auto-generates `swagger.json` and typed `api.d.ts` for all frontends

### 2.2 Desktop Recorder (`plan-ai-recorder`)
- **Stack:** Electron + React (Vite)
- **Purpose:** Captures system audio + microphone during virtual meetings (Zoom, Google Meet, Microsoft Teams)
- **Key feature:** Native macOS audio capture via a custom Swift AudioCapture module that taps into system audio without requiring virtual audio devices
- **Flow:** Records dual streams → uploads to backend → triggers full AI pipeline

### 2.3 Mobile Companion App (`plan-ai-mobile`)
- **Stack:** React Native (Expo) + Expo Router
- **Purpose:** Record in-person meetings on the go
- **Key features:** Real-time voice dictation via WebSocket streaming to Deepgram, AI assistant with project scoping, voice profile enrollment, GPS-tagged recordings
- **Flow:** Records → streams audio → backend transcribes → extracts tasks → syncs to integrations

---

## 3. Complete Feature Inventory

### 3.1 Meeting Intelligence

#### Recording
- **Desktop recording** — System audio + microphone capture for virtual meetings (Zoom, Meet, Teams) via Electron app with native macOS audio interception
- **Mobile recording** — In-person meeting recording with real-time audio streaming via React Native + Deepgram WebSocket
- **Web upload** — Upload pre-recorded audio/video files for transcription
- **Standalone transcripts** — Paste raw text as a "recording" for AI processing without audio

#### Transcription & Analysis
- **Real-time transcription** — Live speech-to-text via Deepgram Nova-3 with WebSocket streaming
- **Batch transcription** — Server-side transcription of uploaded audio files via Groq Whisper
- **Speaker diarization** — Multi-speaker identification and labeling
- **Voice profile matching** — Enrolled voice profiles for automatic speaker identification
- **Keyword boosting** — Project-specific keywords (names, acronyms, jargon) passed as Deepgram `keyterm` hints for improved accuracy
- **Multi-language support** — Configurable transcription language per recording session
- **Sentiment analysis** — Per-recording sentiment scoring (POSITIVE / NEUTRAL / NEGATIVE) with explanations
- **Key points extraction** — AI-generated bullet-point summaries of meeting content
- **Principal speaker detection** — Identifies the dominant speaker per recording
- **AI Persona system** — Configurable AI analysis personas: SECRETARY, ARCHITECT, PRODUCT_MANAGER, DEVELOPER — each produces differently-focused task breakdowns
- **Agentic Investigation mode** — Deep AI analysis mode for complex transcripts
- **Complexity level** — Adjustable depth/language of AI output
- **Custom objectives** — User-defined instructions/objectives per transcript
- **Reprocessing** — Re-run the entire AI pipeline on any transcript

#### Live Meeting Features
- **Live AI chat** — Chat with the AI assistant during a live recording, with real-time transcript as context
- **Live rolling summary** — Auto-updating summary generated every ~20 seconds during recording
- **Chat history preservation** — Live chat saved as a ChatThread after recording ends

#### Post-Meeting Automation Pipeline
After transcription, an async BullMQ pipeline automatically triggers:
1. **Task extraction** — AI analyzes the transcript and creates structured tasks with title, description, acceptance criteria, priority, and type
2. **Jira sync** — Extracted tasks pushed to Jira projects
3. **Linear sync** — Tasks synced to Linear teams
4. **Trello sync** — Tasks created as Trello cards
5. **Notion sync** — Tasks exported to Notion databases
6. **Asana sync** — Tasks synced to Asana projects
7. **Google Drive export** — Transcript and summary exported to Google Drive
8. **OneDrive export** — Transcript and summary exported to Microsoft OneDrive
9. **Document generation** — AI-generated rich-text document from the recording
10. **Slide generation** — AI-generated branded presentation from the recording

Each post-meeting task has independent status tracking (PENDING → OK / FAILED / SKIPPED) with retry capability.

### 3.2 Project Management

#### Projects
- **Project CRUD** — Create, edit, archive, delete projects
- **Project dashboard** — Overview with task counts, recent recordings, file counts
- **Multi-tab project view** — Tasks, Recordings, Files, Keywords, Assistant, Info tabs
- **Project-scoped AI** — Assistant and all AI tools automatically scoped to project context

#### Tasks
- **AI-generated tasks** — Extracted from meetings with title, description, summary, acceptance criteria, priority, type, and due date
- **Manual task creation** — Create tasks directly or via AI assistant
- **AI Task Coach** — AI-powered task refinement: improve descriptions, generate acceptance criteria, estimate story points, decompose into subtasks
- **Task strategies** — Configurable extraction strategies: AUTO (AI decides count), SINGLE_TICKET (consolidated), SPECIFIC_COUNT (user-defined)
- **Kanban board** — Visual task management with drag-and-drop status changes, lane/position tracking
- **Task statuses** — BACKLOG, TODO, IN_PROGRESS, IN_REVIEW, DONE, CANCELLED
- **Task priorities** — CRITICAL, HIGH, MEDIUM, LOW
- **Task types** — FEATURE, BUG, IMPROVEMENT, RESEARCH, DOCUMENTATION, TESTING, DEVOPS
- **Task dependencies** — BLOCKS, RELATES_TO, DUPLICATES relationship types
- **Task hierarchy** — Parent/subtask relationships for nested work breakdown
- **Story points & time tracking** — Estimated and actual minutes, story point fields
- **Assignees** — Assign tasks to workspace members
- **Bi-directional integration sync** — Tasks sync to/from Jira, Linear, Trello, Notion, Asana with automatic field mapping
- **Auto-sync per transcript** — One-click sync of all tasks from a recording to connected integrations

#### Project Knowledge Base (Contexts)
- **1:1 Project ↔ Context** — Every project has a dedicated knowledge base
- **File uploads** — PDF, DOCX, TXT, CSV, XLSX, images, and more
- **Text documents** — Create inline text knowledge entries
- **Website scraping** — Scrape URLs and save content as Markdown files
- **GitHub repository sync** — Connect a GitHub repo + branch; files synced as context
- **AI-powered keyword extraction** — Automatically extracts names, acronyms, and jargon from uploaded files (up to 25 keywords per file)
- **Manual keyword management** — Add, edit, remove keywords that improve transcription accuracy
- **Keyword → Transcription pipeline** — Keywords from the project context are automatically passed to Deepgram as `keyterm` hints (up to 100 terms)

### 3.3 AI Assistant

The AI assistant is a **tool-augmented LLM** (via Vercel AI SDK + OpenRouter) with streaming responses. It's available on:
- **Home page** (`/home`) — workspace-wide assistant
- **Project detail page** (`/projects/:id?tab=assistant`) — project-scoped assistant
- **Mobile app** — with project selector for scoping
- **Threaded chat** (`/chat`) — persistent multi-thread conversations with file attachments and RAG

#### Assistant Tools (26+ tools)
The assistant has access to the following server-side tools:

| Tool | Description |
|------|-------------|
| `navigate` | Navigate the user to any page in the app |
| `listProjects` | List user's projects |
| `listTasks` | List tasks for a project (filterable by status/priority) |
| `listContexts` | List knowledge base elements |
| `listDocuments` | List rich-text documents |
| `listFeatures` | Explain the app's capabilities |
| `explainProject` | Deep-dive into a specific project's data |
| `createProject` | Create a new project |
| `createDocument` | Create a new rich-text document |
| `createContext` | Create a new knowledge base |
| `listRecordings` | List recordings with filters |
| `requestDocumentGeneration` | Generate a document from recordings/context |
| `requestTaskCreation` | Create a task in a project |
| `createBrandTheme` | Create a new brand theme |
| `listSlides` | List presentations |
| `getSlide` | Get presentation details |
| `listDiagrams` | List diagrams |
| `getDiagram` | Get diagram details |
| `getDocument` | Get document content |
| `getRecording` | Get full transcript and details |
| `searchTranscripts` | Semantic search across all transcripts |
| `getRecentMeetingsContext` | Get digest of recent meetings |
| `getMeetingStats` | Meeting statistics (count, hours, sentiment) |
| `getKeyPointsAcrossMeetings` | Cross-meeting theme extraction |
| `listMeetingActionItems` | List open action items across meetings |
| `compareMeetings` | Side-by-side meeting comparison |

#### Assistant Features
- **Streaming responses** — Real-time token-by-token streaming via SSE
- **File attachments** — Attach images, PDFs, CSVs, XLSX, DOCX, JSON, and more (up to 20MB) to messages for multimodal analysis
- **Vector RAG** — Retrieves relevant context from uploaded knowledge base files for grounded answers
- **Project scoping** — When scoped to a project, all tools automatically filter to that project's data
- **Model selection** — Users can pick which AI model to use per message/thread
- **Markdown rendering** — Full markdown support including code blocks, tables, links, Mermaid diagrams
- **Navigable links** — Assistant can generate links that navigate the user to specific recordings, tasks, documents
- **Conversation persistence** — Chat history persisted in Redux (home) or localStorage (per-project)
- **GitNexus code intelligence** — When a GitHub repo is connected, the assistant gains additional tools: `query_codebase` (trace execution flows), `get_symbol_context` (inspect functions/classes), `fetch_url` (web search), and memory tools

### 3.4 Generative Content Studio

#### Documents
- **AI document generation** — Generate rich-text documents from prompts, transcripts, and project context
- **Document editor** — Full rich-text editing with markdown support
- **Public sharing** — Generate public shareable links for documents
- **Export** — Download as various formats

#### Presentations (Slides)
- **AI slide generation** — Generate branded presentations from prompts, transcripts, or project files
- **15 slide types** — Title Only, Text Block, Text + Image, Bullet List, Two Columns, Three Columns, Team Grid, Showcase, Stats, Split KPI, Split Cards, Image with List, Quote Showcase, Diagram Slide
- **Brand theming** — Slides use workspace brand colors, fonts, and styles
- **PPTX export** — Download as PowerPoint files
- **Public sharing** — Shareable presentation links with a web viewer
- **Slide editor** — Visual editor for individual slide customization

#### Diagrams
- **AI diagram generation** — Generate Mermaid.js diagrams from prompts or transcripts
- **18 diagram types** — AUTO, FLOWCHART, SEQUENCE, GANTT, MINDMAP, CLASS, ER, ARCHITECTURE, STATE, JOURNEY, GIT, TIMELINE, PIE, XYCHART, QUADRANT, KANBAN, SANKEY, BLOCK
- **AI assistant iteration** — Refine existing diagrams via conversational AI
- **Live editor** — Edit Mermaid code with real-time preview
- **SVG/PNG export** — Download diagrams as images
- **Public sharing** — Shareable diagram links

### 3.5 Brand Identity System

- **Brand themes** — Create and manage multiple brand themes per workspace
- **Theme properties** — Primary color, secondary color, background color, text color, heading font, body font, logo URL, background style (solid/gradient), card style (flat/elevated)
- **Website URL analyzer** — Auto-extract brand colors, fonts, and logos from any URL
- **Theme application** — Brand themes applied to generated slides, documents, and exports
- **Preset themes** — Multiple built-in theme presets (dark, light, various color schemes)
- **Onboarding theme selection** — Users choose UI theme and brand theme during setup

### 3.6 Integrations

#### Project Management
- **Jira** — OAuth2 connection, bi-directional task sync, project mapping, issue type mapping
- **Linear** — OAuth2 connection, task sync with team/project selection
- **Trello** — OAuth connection, card creation with board/list selection
- **Notion** — OAuth2 connection, database sync for tasks
- **Asana** — OAuth2 connection, task sync with project selection

#### Cloud Storage
- **Google Drive** — OAuth2 connection, export transcripts/documents/presentations to Drive
- **Microsoft OneDrive** — OAuth2 connection, export to OneDrive

#### Development
- **GitHub** — OAuth App connection, repository browsing, branch selection, file sync to project knowledge base

#### Communication
- **Slack** — Workspace notifications and updates (via OAuth)

#### AI Providers (BYOK)
- **OpenRouter** — LLM inference (GPT-4o, Claude, Gemini, Llama, Mistral, etc.)
- **Deepgram** — Speech-to-text (Nova-3)

### 3.7 User & Workspace Management

#### Authentication
- **Email/password** — Traditional auth with email verification
- **Google OAuth** — One-click Google sign-in
- **Apple Sign-In** — Apple account sign-in
- **Microsoft OAuth** — Microsoft account sign-in (including mobile deep-link OAuth flow)
- **Desktop auth exchange** — Web → Electron auth code handoff for the desktop recorder
- **Password reset** — Email-based password recovery

#### Workspaces
- **Multi-workspace** — Users can belong to multiple workspaces
- **Workspace tiers** — FREE, PRO, AGENCY tiers
- **Workspace roles** — OWNER, ADMIN, MEMBER with granular permissions
- **Team management** — Invite members, manage roles, remove members
- **API key management** — Per-workspace OpenRouter and Deepgram keys
- **Usage analytics** — Token usage tracking with monthly limits, per-model breakdown, cost estimation
- **Stripe billing integration** — Payment processing for workspace tiers
- **Workspace switching** — Quick-switch between workspaces from the sidebar
- **Email invitations** — Invite members with 7-day expiry links
- **Auto-accept on signup** — Invited users auto-join workspace on registration

#### User Profile
- **Voice profile** — Upload voice sample for speaker identification in recordings
- **Avatar management** — Profile picture upload
- **User personas** — PROJECT_MANAGER, SOFTWARE_ENGINEER, DESIGNER, PRODUCT_MANAGER, EXECUTIVE, OTHER — used for AI personalization
- **UI theme customization** — Per-user theme preferences (colors, border radius, density, fonts)
- **Language preferences** — i18n support (English, Spanish)

### 3.8 Analytics & Monitoring

- **AI usage dashboard** — Token consumption per model, per day, monthly trends
- **Meeting analytics** — Recording count, total hours, average duration, average participants, per-week trends, by-source distribution
- **Task analytics** — Total generated, per-meeting rate, completion rate, by-status/priority breakdowns, completion trends
- **Sentiment analytics** — Distribution (positive/neutral/negative), weekly trends
- **Blueberry Token system** — Unified token accounting across all AI operations with configurable monthly limits, per-feature breakdown (CHAT, RECORDER, TRANSCRIPTION), per-model cost estimation
- **Period filters** — 7d / 30d / 90d / all-time across all analytics
- **Sentry integration** — Error tracking and performance monitoring across all apps
- **Health check endpoint** — `/api/healthcheck` for uptime monitoring

### 3.9 MCP (Model Context Protocol) Support
- **MCP token management** — Generate and manage MCP access tokens
- **External tool connectivity** — Allows external AI tools to connect to Plan AI's data

---

## 4. Competitive Landscape

### 4.1 Direct Competitors (Meeting AI → Tasks → Docs)

| Product | Overlap | Plan AI Advantage |
|---|---|---|
| **Fireflies.ai** | Transcription, AI assistant, task extraction, integrations | No doc/slide/diagram generation, no BYOK, no project knowledge base |
| **Otter.ai** | Transcription, AI chat over meetings, action items | Consumer-focused, no project management, no generative studio, no BYOK |
| **Fathom** | Meeting recording, AI summaries, action items, CRM sync | Sales-focused (CRM only), no knowledge base or doc generation |
| **Fellow.app** | Meeting notes, action items, project tracking | Manual-first (not AI-native), no transcription recording, no content generation |
| **tl;dv** | Meeting recording, AI summaries, clip sharing | No task management, no doc generation, sales-leaning |

### 4.2 Meeting Intelligence (Enterprise/Sales)

| Product | Overlap | Plan AI Advantage |
|---|---|---|
| **Gong** | Call recording, AI analysis | Enterprise sales only, $100K+ ACV, no project mgmt |
| **Chorus (ZoomInfo)** | Call transcription, analytics | Sales intelligence only, acquired by ZoomInfo |
| **Avoma** | Meeting AI, notes, action items, coaching | Revenue-focused, no generative studio |

### 4.3 AI Workspaces & Project Management

| Product | Overlap | Plan AI Advantage |
|---|---|---|
| **Notion AI** | AI assistant, docs, project management, knowledge base | No meeting recording/transcription, no slide generation, no BYOK |
| **ClickUp AI** | Tasks, docs, AI assistant | No meeting recording, bloated UX, no BYOK |
| **Linear** | Task management, integrations | No AI assistant, no meetings, dev-only |
| **Monday.com AI** | Project management, AI features | No meeting intelligence, enterprise pricing |

### 4.4 AI Content Generation

| Product | Overlap | Plan AI Advantage |
|---|---|---|
| **Gamma.app** | AI slide/presentation generation | No meetings, no tasks, no knowledge base |
| **Tome** | AI presentations | Presentation-only, no workspace |
| **Beautiful.ai** | Slide design | Template-based, not AI-native |

### 4.5 Unique Differentiators

1. **Full-cycle loop** — Record → Transcribe → Extract Tasks → Generate Docs/Slides/Diagrams. No competitor does end-to-end.
2. **BYOK architecture** — No per-seat AI markup. Users pay providers directly at cost. Unique in this space.
3. **Project knowledge base** — Files, websites, GitHub repos feeding both transcription accuracy (Deepgram keywords) and AI context. No competitor has this feedback loop.
4. **Multi-platform recording** — Desktop (system audio capture), Mobile (in-person), Web (upload). Most competitors are web-only.
5. **Generative content studio** — Documents, branded slides (15 types with PPTX export), and Mermaid diagrams. Competitors stop at summaries.
6. **Tool-augmented AI assistant** — 26 server-side tools that can navigate, create, search, and analyze. Not just a chatbot.
7. **Integration breadth** — Jira, Linear, Trello, Notion, Asana, Google Drive, OneDrive, GitHub, Slack — with bi-directional sync, not just one-way push.

---

## 5. Technical Differentiators

- **Type-safe API contract** — TSOA generates OpenAPI spec; `openapi-typescript` auto-generates typed `api.d.ts` for all three frontends. Zero manual type duplication.
- **Async processing pipeline** — BullMQ + Redis for non-blocking post-meeting processing. Up to 10 parallel tasks per recording.
- **Vector search** — Qdrant enables semantic search across all transcripts, not just keyword matching.
- **Native audio capture** — Custom Swift AudioCapture module for macOS system audio (no virtual audio devices needed).
- **Real-time streaming** — WebSocket-based audio streaming with live transcription, plus SSE-based AI assistant response streaming.

---

## 6. User Flows

### Flow 1: Virtual Meeting → Tasks in Jira
1. User opens Desktop Recorder, selects project, starts recording
2. System audio + mic captured natively
3. Recording uploaded to backend
4. BullMQ pipeline: transcribe → extract tasks → sync to Jira
5. User gets notification with link to transcript and synced Jira issues

### Flow 2: In-Person Meeting → Project Update
1. User opens Mobile App, selects project, starts recording
2. Audio streams via WebSocket to Deepgram with project keywords
3. Recording saved and processed
4. User opens web app, navigates to project → Assistant tab
5. Asks: "Create a project update document from today's meeting"
6. AI generates rich-text document using transcript + project context

### Flow 3: Knowledge → Presentation
1. User uploads PDFs, scrapes competitor websites into project knowledge base
2. Keywords auto-extracted and boosted for future transcriptions
3. User asks assistant: "Create a competitive analysis presentation"
4. AI generates branded slides using project knowledge + meeting history
5. User downloads PPTX or shares public link

### Flow 4: Cross-Meeting Analysis
1. User has 20 recordings across a project over 3 months
2. Opens Home → Assistant, scopes to project
3. Asks: "What are the recurring themes and unresolved issues?"
4. AI uses `getKeyPointsAcrossMeetings` and `listMeetingActionItems` tools
5. Returns structured analysis with links to specific recordings

---

## 7. Pricing Context

Plan AI's BYOK model enables flexible pricing strategies:

- **Platform fee** — Charge for the workspace, not for AI usage
- **No token markup** — Unlike competitors who charge 5-10x markup on AI tokens
- **Transparent costs** — Users see exact token consumption in the AI Usage dashboard
- **Monthly token limits** — Configurable per workspace (default: 200,000 Blueberry Tokens)
- **Courtesy workspaces** — Admin-flagged workspaces that bypass BYOK requirements (for demos, trials)

---

## 8. Tech Stack Summary

| Layer | Technology |
|---|---|
| **Frontend (Web)** | React, TypeScript, MUI, Redux Toolkit, RTK Query, React Router, i18next |
| **Frontend (Mobile)** | React Native, Expo, Expo Router, React Native Paper |
| **Frontend (Desktop)** | Electron, React, Vite, Swift (AudioCapture) |
| **Backend** | Node.js, Express, TypeScript, TSOA |
| **Database** | PostgreSQL (Prisma ORM) |
| **Vector DB** | Qdrant |
| **Queue** | BullMQ + Redis |
| **AI/LLM** | OpenRouter (multi-model), Vercel AI SDK |
| **Speech-to-Text** | Deepgram Nova-3 (WebSocket + REST) |
| **Auth** | Firebase Auth (Google, Microsoft, Email/Password) |
| **Monitoring** | Sentry |
| **API Types** | TSOA → OpenAPI → openapi-typescript |
