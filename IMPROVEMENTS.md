# Plan AI Improvements Roadmap

This document outlines the high-priority features, technical debt, and quality-of-life improvements planned for the Plan AI ecosystem (Web, Desktop Recorder, and Mobile App).

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

## 4. Acoustic Echo Cancellation (AEC) for Desktop Recorder
**Problem:** When recording a meeting on Desktop without headphones, the system audio (other people speaking) comes out of the loudspeakers and feeds directly back into the user's microphone, resulting in echo, duplicate transcription, and hallucinated tasks.
**Solution:**
- Research and implement an Acoustic Echo Cancellation (AEC) strategy within the Electron/Vite audio capture pipeline.
- Consider utilizing WebRTC's native `echoCancellation: true` constraint for the microphone stream.
- Alternatively, implement a backend audio post-processing step to subtract the system audio waveform from the microphone waveform before sending it to Deepgram.

## 5. Notion Integration (Knowledge Base Sync)
**Problem:** While Plan AI is excellent at extracting actionable tasks, many meetings result in long-term decisions, wikis, or general knowledge that belongs in a documentation hub rather than an issue tracker.
**Solution:**
- Build an official integration with the Notion API.
- Allow users to automatically export full formatted transcripts, executive summaries, and action item lists directly into a selected Notion Database or Page.
- Enable a "Sync to Notion" toggle alongside the existing Jira/Linear/Trello options in the recording flow.

## 6. If transcript generation fails
**Problem:** If transcript generation fails, the user is left without tasks and no easy way to try again.
**Solution:**
- Add a "Retry Generation" button in the UI for users if an AI extraction job fails due to rate limits or timeouts. We need to store somehow that htis failed so in the recorder ui and mobile we can retry

## 7. Migrate all to generateText and telemetry all the usage including retries
**Problem:** We are using generateObject which is a wrapper around generateText and there is no usage telemetry. We need to migrate all to generateText and telemetry all the usage including retries.

## 8. Backend Scaling Bottlenecks (Infrastructure)
**Problem:** As concurrent users grow, the current infrastructure has a few architectural weak points that will fail under heavy load.
**Solutions to Implement:**
- **Redis Memory Exhaustion:** BullMQ currently stores massive payloads (like raw transcript texts and context strings) directly in Redis. If hundreds of large meetings are uploaded simultaneously, Redis RAM will OOM. **Fix:** Upload payloads to S3/Cloud Storage and pass a lightweight reference ID into the BullMQ job.
- **Database Connection Limits:** Prisma opens direct connections to PostgreSQL. Sudden bursts of background workers and API requests will exhaust connections. **Fix:** Implement Prisma Connection Pooling (PgBouncer) or use Railway's built-in connection pooler for serverless scaling.
- **Vector Database (Qdrant) Costs:** Storing massive codebase vectors for thousands of users will become expensive as Qdrant requires high RAM for fast RAG search. **Fix:** Optimize vector embeddings by discarding noisy code (e.g. minified files, lockfiles) and experiment with quantization.
- **External API Rate Limiting:** Even with background queues, hammering Deepgram or OpenRouter with 500 concurrent requests will trigger HTTP 429 Too Many Requests. **Fix:** Implement rate-limit aware job concurrency in BullMQ, dynamically throttling workers when APIs respond with 429s.