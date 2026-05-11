# Quick Start

The absolute fastest way to start using Plan AI is to use our fully managed, securely hosted cloud platform.

## 1. The Cloud Platform (Recommended)

You do not need to install anything or manage servers to use Plan AI. 
1. Head over to **[plan-ai.blueberrybytes.com](https://plan-ai.blueberrybytes.com)**.
2. Sign in with Google or create an account.
3. Plug in your OpenRouter and Deepgram API keys in the Workspace Settings.
   * Don't have an OpenRouter key? [Read the OpenRouter setup guide](/setup/openrouter).
   * Don't have a Deepgram key? [Read the Deepgram setup guide](/setup/deepgram).
4. Download the Desktop Recorder and start capturing your meetings.

It takes less than 2 minutes to get fully set up.

---

## 2. Running Locally (For Developers)

We’ve designed Plan AI to be incredibly easy to spin up locally. If you want to contribute to the open-source project or self-host the platform on your own machine, follow these steps.

## Prerequisites

Before starting, ensure you have the following installed on your machine:
*   **Node.js** (v22.17.1 or higher)
*   **Yarn**
*   **Docker Desktop** (For running the local Postgres, Redis, and Qdrant databases)
*   **Python** (via `uv` for the Voice AI microservice)

You will also need two API keys:
1.  [OpenRouter API Key](https://openrouter.ai/) for LLM processing.
2.  [Deepgram API Key](https://deepgram.com/) for audio transcription.

## 1. Install Dependencies

Plan AI is a monorepo. We use a master script to install all dependencies across the frontend, backend, native apps, and Python microservices simultaneously.

First, ensure you have our code intelligence tool installed globally:
```bash
npm install -g gitnexus
```

Then, from the root of the repository, run:
```bash
yarn install:all
```

## 2. Environment Setup

Generate the necessary `.env` files for all applications across the monorepo by running the setup script from the root:

```bash
yarn setup:env
```

Once the `.env` files are created, open `plan-ai/backend/.env` and insert your `OPENROUTER_API_KEY` and `DEEPGRAM_API_KEY`.

*(Note: You will also need to configure your Firebase project credentials in these files for authentication to work properly).*

## 3. Start Local Databases

Before starting the applications, you must start the local Postgres, Redis, and Qdrant databases via Docker:

```bash
yarn docker
```

Once the database containers are running, push the latest Prisma schema migrations to set up your tables:

```bash
yarn db:migrate
```

### (Optional) Seed the Database
You can automatically provision an Admin user (`admin@plan-ai.local` / `password123`) by running:
```bash
yarn db:seed
```
This grants you immediate access to the Admin Dashboard without needing to manually register via the web UI.

## 4. Start the Platform

From the root of the project, use the following master script to launch everything concurrently:

```bash
yarn dev
```

This single command will simultaneously start:
1.  **The Backend API** (Node/Express on Port 8080)
2.  **The Web Frontend** (React/Vite on Port 3000)
3.  **The Voice Biometrics Service** (Python/FastAPI on Port 8001)
4.  **GitNexus MCP Server** (For local code intelligence)

**Success!** You can now visit `http://localhost:3000` to log in and start using Plan AI.

---

### Starting the Client Apps (Optional)

If you also want to test the native clients alongside the web platform, open a new terminal tab at the root of the project and run:

**For the Desktop Recorder:**
```bash
yarn dev:recorder
```

**For the Mobile App:**
```bash
yarn dev:mobile
```
