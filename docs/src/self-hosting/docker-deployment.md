# Docker Deployment

Plan AI is designed to be easily deployed to any VPS or cloud provider (like Railway, Render, or DigitalOcean) using Docker.

## The Data Layer
Plan AI requires three stateful data stores:
1.  **PostgreSQL** (Relational Data)
2.  **Redis** (Message Queues via BullMQ)
3.  **Qdrant** (Vector Embeddings)

If you are running locally or on a single VPS, we provide a `docker-compose.yml` file in the root directory to spin these up instantly.

```bash
# Start all required databases
yarn docker
```

If you are deploying to a production environment (like Railway), you should provision these three databases as separate managed services and pass their connection strings via the environment variables (`DATABASE_URL`, `REDIS_URL`, `QDRANT_URL`).

## Building the Production Services

Plan AI has multiple Dockerfiles for different services. 

### 1. The Backend API
The main Node.js backend should be built from the root of the repository so it can correctly compile the shared workspaces.

```bash
docker build -f plan-ai/backend/Dockerfile -t plan-ai-backend .
docker run -p 8080:8080 --env-file plan-ai/backend/.env plan-ai-backend
```

### 2. The Voice Biometrics Service
The Python voice service requires system-level dependencies like `ffmpeg` to process audio files. It has its own dedicated Dockerfile.

```bash
docker build -f plan-ai/voice-ai/Dockerfile -t plan-ai-voice .
docker run -p 8001:8001 --env-file plan-ai/voice-ai/.env plan-ai-voice
```

### 3. The Web Frontend
The Vite frontend compiles to static HTML/JS/CSS. We provide a multi-stage Dockerfile that builds the React app and serves it securely using Nginx.

```bash
docker build -f plan-ai/frontend/Dockerfile -t plan-ai-frontend .
docker run -p 3000:80 --env-file plan-ai/frontend/.env plan-ai-frontend
```

## Reverse Proxy Consideration
When deploying to production, ensure that your reverse proxy (e.g., Traefik, Nginx, or Railway's built-in router) is configured to allow large payload uploads. 

Meeting recordings can be hundreds of megabytes in size. If you are using Nginx, you must set `client_max_body_size 500M;` to prevent the Desktop Recorder from receiving 413 Payload Too Large errors.
