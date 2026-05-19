# Plan AI Improvements Roadmap

This document outlines the high-priority features, technical debt, and quality-of-life improvements planned for the Plan AI ecosystem (Web, Desktop Recorder, and Mobile App).

## 0. Integrations must be for the Workspace
Only ADMIN or OWNER of the workspace can create integrations. And an integration. Members can oly see not edit or delete integratios 

## 1. Asynchronous Task Generation & Resiliency
**Problem:** Extracting tasks from transcripts via AI can take significant time, especially for long meetings. If the generation fails or the connection drops during this window, the user is left without tasks and no easy way to try again.
**Solution:**
- Decouple the task generation step from the immediate recording upload flow using background jobs (e.g., BullMQ).
- Implement a robust polling or WebSocket mechanism on the Desktop and Mobile apps to reflect the "Processing" state.
- Add a "Retry Generation" button in the UI for users if an AI extraction job fails due to rate limits or timeouts.

## 2. Universal Search for Recordings
**Problem:** As users accumulate dozens of meetings, finding a specific past recording becomes difficult without a search mechanism.
**Solution:**
- Add a persistent search bar to the Desktop Recorder and Mobile App interfaces.
- Enable fuzzy searching across meeting titles, dates, and transcript contents.
- Consider utilizing the existing Qdrant vector database or basic PostgreSQL text search to instantly retrieve relevant historical meetings.

## 3. Official Marketplace Applications (Jira, Linear, Trello)
**Problem:** Currently, integrations may rely on personal API keys, basic authentication, or generic OAuth workflows, which can feel unpolished for enterprise users.
**Solution:**
- Register official "Plan AI by Blueberrybytes" applications in the Atlassian Marketplace (Jira), Linear App Directory, and Trello Power-Ups.
- Transition the backend to use secure, official OAuth 2.0 flows tied to these registered applications.
- This will increase brand trust, simplify the user onboarding experience, and ensure compliance with strict corporate IT policies.

## 4. Notion Integration (Knowledge Base Sync)
**Problem:** While Plan AI is excellent at extracting actionable tasks, many meetings result in long-term decisions, wikis, or general knowledge that belongs in a documentation hub rather than an issue tracker.
**Solution:**
- Build an official integration with the Notion API.
- Allow users to automatically export full formatted transcripts, executive summaries, and action item lists directly into a selected Notion Database or Page.
- Enable a "Sync to Notion" toggle alongside the existing Jira/Linear/Trello options in the recording flow.

## 5. If transcript generation fails
**Problem:** If transcript generation fails, the user is left without tasks and no easy way to try again.
**Solution:**
- Add a "Retry Generation" button in the UI for users if an AI extraction job fails due to rate limits or timeouts. We need to store somehow that htis failed so in the recorder ui and mobile we can retry

## 6. Backend Scaling Bottlenecks (Infrastructure)
**Problem:** As concurrent users grow, the current infrastructure has a few architectural weak points that will fail under heavy load.
**Solutions to Implement:**
- **Redis Memory Exhaustion:** BullMQ currently stores massive payloads (like raw transcript texts and context strings) directly in Redis. If hundreds of large meetings are uploaded simultaneously, Redis RAM will OOM. **Fix:** Upload payloads to S3/Cloud Storage and pass a lightweight reference ID into the BullMQ job.
- **Database Connection Limits:** Prisma opens direct connections to PostgreSQL. Sudden bursts of background workers and API requests will exhaust connections. **Fix:** Implement Prisma Connection Pooling (PgBouncer) or use Railway's built-in connection pooler for serverless scaling.
- **Vector Database (Qdrant) Costs:** Storing massive codebase vectors for thousands of users will become expensive as Qdrant requires high RAM for fast RAG search. **Fix:** Optimize vector embeddings by discarding noisy code (e.g. minified files, lockfiles) and experiment with quantization.
- **External API Rate Limiting:** Even with background queues, hammering Deepgram or OpenRouter with 500 concurrent requests will trigger HTTP 429 Too Many Requests. **Fix:** Implement rate-limit aware job concurrency in BullMQ, dynamically throttling workers when APIs respond with 429s.

## 7. Context Graph Visualization (The Commercial "WOW" Effect)
**Problem:** The AI processing (GitNexus RAG) happens in the background, making it feel like a "black box" to the user. To sell this to technical leads and CTOs, we need a visual proof of work that generates immediate trust and a "WOW" factor during demos.
**Solution:**
- Do NOT render the entire codebase graph (500k+ nodes will cause the browser to OOM and create a visual "hairball").
- Instead, implement a **"Local Context Graph"** button under each generated ticket in the UI.
- When clicked, open a WebGL interactive canvas (using `react-force-graph-2d` or `cytoscape.js`).
- Render only the **exact path** of nodes (10-30 files/functions) that the AI investigated to generate that specific ticket. 
- Example: `Ticket` -> `userController.ts` -> `AuthService` -> `schema.prisma`. 
- **Impact:** Negligible performance cost in React, but massive commercial impact. It visually proves the AI's "train of thought" and architectural understanding.

## 8. Missing translations in a lot of pages that are hardcoded

---

## 9. Calendar Integration (Google Calendar / Outlook)
**Priority:** 🔥 High — Biggest friction killer  
**Problem:** Users must manually start recordings, name meetings, and assign projects. This creates adoption friction and means meetings that aren't manually triggered are lost forever.  
**Solution:**
- Integrate with Google Calendar API and Microsoft Graph Calendar API using existing OAuth credentials.
- Auto-detect upcoming meetings and pre-populate the title, participants, and project association.
- Optionally auto-start the desktop recorder when a calendar event begins (with user opt-in).
- Pre-fill the recording screen with event metadata (attendees, agenda, linked project).
- **Unlocks:** Email-to-participants, follow-up tracking, and speaker identification from attendee lists.

## 10. Email Meeting Notes to Participants
**Priority:** 🔥 High — Viral growth driver  
**Problem:** After a meeting is processed, only the person who recorded it sees the summary and tasks. Other attendees have no visibility unless they log into Plan AI.  
**Solution:**
- After transcript processing completes, auto-send a polished email with the summary + action items to all meeting attendees (pulled from the calendar invite).
- Use the existing Resend integration for delivery.
- Include a "View Full Transcript" deep-link back to the Plan AI web dashboard.
- Allow users to customize the email template and opt-out specific meetings.
- **Impact:** This is how the tool goes viral within a team — coworkers who never installed Plan AI start receiving valuable meeting notes and want to adopt it themselves.

## 11. Follow-up Reminders & Cross-Meeting Tracking
**Priority:** 🔥 High — Retention hook  
**Problem:** Action items from meetings are extracted but there's no mechanism to track whether they were completed before the next meeting. Tasks get lost between sessions.  
**Solution:**
- Track task completion status across recurring meetings (linked via calendar events).
- At the start of a recurring meeting, surface a "Pending from last time" panel showing unresolved tasks.
- Send automated reminder notifications (email / push) to task assignees before the next occurrence.
- Build a "Meeting Health" score: % of action items completed between sessions.
- **Impact:** This transforms Plan AI from a "recording tool" into a true accountability system.

## 12. Semantic Search Across All Transcripts
**Priority:** 💪 Medium — Differentiator  
**Problem:** Users accumulate hundreds of meetings but can only search by title or date. Finding "what did we decide about the pricing model 3 weeks ago?" is impossible.  
**Solution:**
- Leverage the existing Qdrant vector database to index all transcript content.
- Build a semantic search endpoint that returns relevant transcript snippets ranked by meaning, not just keyword match.
- Surface results with timestamps and speaker attribution so users can jump to the exact moment.
- Add a global search bar across Web, Recorder, and Mobile apps.
- **Impact:** Nobody else does cross-meeting semantic search well. This is a genuine competitive moat.

## 13. Meeting Templates / Personas per Meeting Type
**Priority:** 💪 Medium — Power user feature  
**Problem:** A daily standup, a client discovery call, and a retrospective all produce very different types of tasks. The current one-size-fits-all AI extraction doesn't optimize for each format.  
**Solution:**
- Create meeting type templates: Standup (extract blockers + updates), Retro (extract action items + wins), Client Call (extract requirements + follow-ups), 1:1 (extract feedback + goals).
- Allow users to associate a template with a recurring calendar event so it auto-applies.
- Customize the AI extraction prompt per template to produce domain-specific task structures.

## 14. Slack / Microsoft Teams Bot
**Priority:** 💪 Medium — Team awareness  
**Problem:** Only the recorder user sees the output. The rest of the team has no awareness unless they check the web dashboard.  
**Solution:**
- Build a Slack bot and Teams bot that posts the meeting summary + task list to a configured channel after processing.
- Allow per-project channel mapping (e.g., "Engineering Standup" → #engineering).
- Include interactive buttons: "View Transcript", "Assign to me", "Mark Done".
- **Impact:** Gets the *entire team* engaged with Plan AI output, not just the person who recorded.

## 15. Speaker Labels / Voice Fingerprinting
**Priority:** 🧹 Polish  
**Problem:** Transcripts show "Speaker 1", "Speaker 2" which makes reading difficult. Users can't tell who said what without cross-referencing.  
**Solution:**
- Map speakers to real names using calendar attendee lists (from Calendar Integration).
- Optionally build voice fingerprinting: after a few meetings, auto-recognize returning speakers by their voice profile.
- Allow manual speaker labeling in the transcript viewer that persists for future meetings.

## 16. Dashboard Analytics
**Priority:** 🧹 Polish — Enterprise selling point  
**Problem:** Managers and team leads can't quantify meeting culture or justify the tool's ROI to their organization.  
**Solution:**
- Track metrics: meetings per week, average duration, tasks generated per meeting, task completion rate, talk-time ratio per speaker.
- Build a "Meeting Health" dashboard in the web app with trend charts.
- Export weekly/monthly reports as PDF or email digest.
- **Impact:** This is the feature that sells Plan AI to enterprise — managers love data about their team's meeting culture.

## 17 On meetings
we can add also the pain points if exists of the client and things that client consider important

## 18 Error on Sync task
If after a meet a sync fails to Jira, Linear or whatever we need to somehow store the error and show in the UI