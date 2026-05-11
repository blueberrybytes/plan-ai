# GitNexus Code Intelligence

The holy grail of AI-assisted software development is connecting the high-level business requirements discussed in meetings directly to the underlying source code.

Plan AI achieves this through its tight integration with **GitNexus**.

## What is GitNexus?

GitNexus is an advanced code intelligence system that indexes your entire repository into a semantic knowledge graph. It understands the relationships between functions, classes, API routes, and database models.

When running Plan AI locally or connecting it to your codebase, the Plan AI backend communicates with the GitNexus Model Context Protocol (MCP) Server.

## How Plan AI uses GitNexus

When you generate tickets or ask the chat interface to map out an implementation plan from a meeting transcript, Plan AI can query the GitNexus MCP server to read your actual code.

### 1. Zero-Hallucination Tickets
If a TPM assigns a ticket to a developer based on a meeting, Plan AI will use GitNexus to scan the repository and find the exact files that need to be modified.

Instead of: *"Update the user profile to include an avatar URL."*

The ticket becomes: *"Update the `UserProfile` component in `src/components/UserProfile.tsx` to include an avatar URL. You will also need to update the Prisma schema in `backend/prisma/schema.prisma` and regenerate the types."*

### 2. Impact Analysis
Before suggesting a technical change, Plan AI can run an **Impact Analysis** via GitNexus. If the meeting transcript suggests modifying the `AuthService`, GitNexus will tell Plan AI exactly how many other services depend on that `AuthService`, preventing the AI from suggesting a change that would cause a massive blast radius.

By combining audio transcription with deterministic code intelligence, Plan AI bridges the gap between the product team's meetings and the engineering team's IDE.
