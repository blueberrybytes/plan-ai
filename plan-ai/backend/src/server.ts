import { getLlmProvider } from "./utils/localAi";
import dotenv from "dotenv";
dotenv.config();
import "./sentry/sentry";
import express, { RequestHandler } from "express";
import bodyParser from "body-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit, { type Options } from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import swaggerDocument from "./swagger/swagger.json";
import path from "path";
import EnvUtils from "./utils/EnvUtils";
import { logger } from "./utils/logger";
import { RegisterRoutes } from "./routes/routes";
import chatRouter from "./routes/chatRouter";
import gitnexusRouter from "./routes/gitnexusRouter";
import { mcpRouter } from "./routes/mcpRouter";
import { accessScopeMiddleware } from "./services/accessScope";
import { initializeContextVectorStore } from "./vector/contextFileVectorService";
import { setupAudioStream } from "./routes/audioStream";
import { microsoftMobileStart, microsoftMobileCallback } from "./controller/sessionController";
// Initialize background workers
import { githubContextWorker } from "./workers/githubContextWorker";
import { githubContextQueue } from "./queue/githubContextQueue";
import { pricingSyncWorker } from "./workers/pricingSyncWorker";
import { pricingSyncQueue } from "./queue/pricingSyncQueue";
import { weeklyDigestWorker } from "./workers/weeklyDigestWorker";
import { weeklyDigestQueue } from "./queue/weeklyDigestQueue";
import { teamReportWorker } from "./workers/teamReportWorker";
import { teamReportQueue } from "./queue/teamReportQueue";
import { storageCleanupWorker } from "./workers/storageCleanupWorker";
import { storageCleanupQueue } from "./queue/storageCleanupQueue";
import { transcriptGenerationWorker } from "./workers/transcriptGenerationWorker";
import { transcriptGenerationQueue } from "./queue/transcriptGenerationQueue";
import { taskRefinementWorker } from "./workers/taskRefinementWorker";
import { taskRefinementQueue } from "./queue/taskRefinementQueue";
import { contextDocumentWorker } from "./workers/contextDocumentWorker";
import { contextDocumentQueue } from "./queue/contextDocumentQueue";
import { pricingCacheService } from "./services/pricingCacheService";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import basicAuth from "express-basic-auth";
import * as Sentry from "@sentry/node";
import multer from "multer";

console.log("Server starting...");
const app = express();
const PORT = EnvUtils.get("PORT") || 8080;
const QDRANT_URL = EnvUtils.get("QDRANT_URL") || "http://127.0.0.1:6333";

// Middlewares

// Trust the first proxy hop (nginx, ALB, Cloud Run, etc.) so Express reads
// the real client IP from X-Forwarded-For. Required for express-rate-limit to
// work correctly behind a reverse proxy.
app.set("trust proxy", 1);
app.use(helmet());
// First of all: each request gets the scope that later holds what the caller
// must not see (restricted projects). See services/accessScope.ts.
app.use(accessScopeMiddleware);

// CORS — in production set CORS_ORIGINS="https://plan-ai.blueberrybytes.com,https://other.domain"
// The desktop recorder serves its UI from app://recorder, so that origin is
// always allowed. When CORS_ORIGINS is unset: local dev allows every origin,
// production allows only APP_URL (it used to reflect any origin there too).
const RECORDER_ORIGIN = "app://recorder";
const corsOriginsEnv = EnvUtils.get("CORS_ORIGINS", "");
const isProduction = process.env.NODE_ENV === "production";
const corsOrigin: cors.CorsOptions["origin"] = corsOriginsEnv
  ? [...corsOriginsEnv.split(",").map((s) => s.trim()), RECORDER_ORIGIN]
  : isProduction
    ? [EnvUtils.get("APP_URL", "").replace(/\/+$/, ""), RECORDER_ORIGIN].filter(Boolean)
    : true;
if (isProduction && !corsOriginsEnv) {
  console.warn("[CORS] CORS_ORIGINS is not set: only APP_URL and the recorder are allowed.");
}

app.use(
  cors({
    origin: corsOrigin,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "x-api-key",
      "X-Workspace-Id",
      "X-Current-Path",
    ],
    credentials: true,
  }),
);
// No form posts carry files here (those are multipart), so 1 MB is plenty.
app.use(bodyParser.urlencoded({ limit: "1mb", extended: true }));
app.use(
  bodyParser.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      // Required for GitHub webhook signature validation
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);

// Add route logging middleware before registering routes
app.use((req, res, next) => {
  if (process.env.ENV === "local") {
    console.debug(`Request received: ${req.method} ${req.path}`);
  }
  next();
});

// Disable browser caching for all API responses
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

// Rate-limit breach handler — logs + reports to Sentry for visibility
const rateLimitHandler: Options["handler"] = (
  req: express.Request,
  res: express.Response,
  _next: express.NextFunction,
  options,
) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const limiterName = options.max === 20 ? "ai" : "api";
  logger.warn(`[rate-limit] ${limiterName} limit hit — IP=${ip} path=${req.path}`);
  Sentry.captureEvent({
    message: `Rate limit exceeded (${limiterName})`,
    level: "warning",
    tags: { limiter: limiterName },
    extra: { ip, path: req.path, method: req.method, limit: options.max },
  });
  res.status(options.statusCode).json(options.message);
};

// Global API rate limiter
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  handler: rateLimitHandler,
});

// Tighter limiter for AI-heavy endpoints
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "AI rate limit exceeded. Please wait before making another request." },
  handler: rateLimitHandler,
});

app.use("/api/", apiLimiter);
app.use("/api/chat", aiLimiter);
app.use("/api/presentations/generate", aiLimiter);
// Document and diagram generation are POST /api/documents and /api/diagrams.
// The old "/generate" paths matched no route.
const postOnly =
  (limiter: RequestHandler): RequestHandler =>
  (req, res, next) =>
    req.method === "POST" ? limiter(req, res, next) : next();
app.use("/api/documents", postOnly(aiLimiter));
app.use("/api/diagrams", postOnly(aiLimiter));
app.use("/api/trackers/extract", aiLimiter);
// The MCP endpoint and the queue dashboard are outside /api.
app.use("/mcp", apiLimiter);
app.use(
  "/admin",
  rateLimit({
    // Brute force on the dashboard password. The dashboard polls every few
    // seconds, so only failed requests (wrong password) count.
    windowMs: 15 * 60 * 1000,
    max: 30,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler,
  }),
);

// Register TSOA routes (with role-based access control and increased upload limits)
RegisterRoutes(app, {
  multer: multer({
    limits: {
      fileSize: 524288000, // 500MB
      // No route takes more than two files (mic + system audio). Uploads are
      // held in memory, so an unbounded count could exhaust it.
      files: 4,
    },
  }),
});

// Register manual routes
app.use("/api/chat", chatRouter);
app.use(gitnexusRouter);

// Microsoft Mobile OAuth (not TSOA — these must redirect, not return JSON)
app.get("/api/auth/microsoft/mobile-start", microsoftMobileStart);
app.get("/api/auth/microsoft/mobile-callback", microsoftMobileCallback);

// Plan AI MCP Server — outside /api to avoid TSOA middleware
app.use("/mcp", mcpRouter);

// API docs and the database schema describe every endpoint and table. Useful
// in development, a map for attackers in production unless turned on.
const exposeApiDocs = !isProduction || process.env.EXPOSE_API_DOCS === "true";
if (exposeApiDocs) {
  // Swagger Documentation
  app.get("/api-docs/json", (req, res) => {
    res.sendFile(path.join(__dirname, "swagger", "swagger.json"), {
      headers: {
        "Content-Type": "application/json",
      },
    });
  });

  // Swagger documentation route
  const swaggerServeHandlers = swaggerUi.serve as unknown as RequestHandler[];
  const swaggerSetupHandler = swaggerUi.setup(swaggerDocument) as unknown as RequestHandler;
  app.use("/api-docs", ...swaggerServeHandlers, swaggerSetupHandler);

  app.get("/prisma-schema", (req, res) => {
    const schemaPath = path.join(__dirname, "../prisma/schema.prisma");
    res.setHeader("Content-Type", "text/plain");
    res.sendFile(schemaPath);
  });
}

// Setup Bull Board UI
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");
createBullBoard({
  queues: [
    new BullMQAdapter(githubContextQueue),
    new BullMQAdapter(pricingSyncQueue),
    new BullMQAdapter(transcriptGenerationQueue),
    new BullMQAdapter(taskRefinementQueue),
    new BullMQAdapter(contextDocumentQueue),
    new BullMQAdapter(weeklyDigestQueue),
    new BullMQAdapter(teamReportQueue),
    new BullMQAdapter(storageCleanupQueue),
  ],
  serverAdapter: serverAdapter,
});

// The dashboard shows job payloads (meeting transcripts) and can retry or
// delete jobs. It is only mounted with real credentials: the old fallback
// was admin/admin.
const bullBoardUser = EnvUtils.get("BULL_BOARD_USER", "");
const bullBoardPassword = EnvUtils.get("BULL_BOARD_PASSWORD", "");
if (bullBoardUser && bullBoardPassword.length >= 16 && bullBoardPassword !== "admin") {
  const basicAuthMiddleware = basicAuth({
    users: { [bullBoardUser]: bullBoardPassword },
    challenge: true,
  });
  app.use("/admin/queues", basicAuthMiddleware, serverAdapter.getRouter());
} else {
  console.warn(
    "[BullBoard] Not mounted: set BULL_BOARD_USER and a BULL_BOARD_PASSWORD of 16+ characters.",
  );
}

// True 404 logger — MUST stay after every route mount (TSOA, chat, swagger,
// Bull Board). It used to sit before Bull Board, which made every normal
// panel poll log a false "No route matched" warning.
app.use((req, res, next) => {
  console.warn(`No route matched: ${req.method} ${req.path}`);
  next();
});

// Custom error handler to catch TSOA and Auth errors cleanly without stack traces or Sentry pollution
app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof Error && err.name === "ValidateError") {
    const fields = (err as Error & { fields?: unknown }).fields;
    console.warn(`Caught Validation Error for ${req.path}:`, fields);
    res.status(422).json({
      message: "Validation Failed",
      details: fields,
    });
    return;
  }

  // Multer errors carry no HTTP status, so a file over the limit used to come
  // back as a 500 and clients retried it forever.
  if (err instanceof multer.MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    console.warn(`[upload] ${status} ${err.code} for ${req.path}`);
    res.status(status).json({ code: err.code, message: err.message });
    return;
  }

  // SubscriptionRequiredError carries status=402 + a structured payload.
  if (err instanceof Error && err.name === "SubscriptionRequiredError") {
    const subErr = err as Error & { status: number; code: string; reason: string };
    console.warn(`[guard] 402 Subscription Required for ${req.path}: ${subErr.reason}`);
    res
      .status(subErr.status)
      .json({ code: subErr.code, message: subErr.message, reason: subErr.reason });
    return;
  }

  // UsageLimitExceededError carries status=429 + a structured payload.
  if (err instanceof Error && err.name === "UsageLimitExceededError") {
    const limitErr = err as Error & {
      status: number;
      code: string;
      limitType: string;
      used: number;
      allowed: number;
    };
    console.warn(
      `[usage-limit] 429 for ${req.path}: ${limitErr.limitType} ${limitErr.used}/${limitErr.allowed}`,
    );
    res.status(limitErr.status).json({
      code: limitErr.code,
      message: limitErr.message,
      limitType: limitErr.limitType,
      used: limitErr.used,
      allowed: limitErr.allowed,
    });
    return;
  }

  if (err instanceof Error && "status" in err) {
    const status = (err as Error & { status: number }).status;
    res.status(status).json({ message: err.message });
    return;
  }

  // Handle plain object errors thrown by BaseWorkspaceController (e.g. { status: 400, message: "..." })
  if (
    typeof err === "object" &&
    err !== null &&
    !Array.isArray(err) &&
    "status" in err &&
    "message" in err
  ) {
    const errObj = err as { status: number; message: string; code?: unknown; current?: unknown };
    console.warn(`[Controller Error] ${errObj.status}: ${errObj.message}`);
    // `code` tells the apps what to do, e.g. "mfa_required" for a workspace
    // that needs two-step verification. `current` is the server's copy of a
    // note on a version conflict, so the app can keep both texts.
    res.status(errObj.status).json({
      message: errObj.message,
      ...(typeof errObj.code === "string" ? { code: errObj.code } : {}),
      ...(errObj.code === "note_version_conflict" && errObj.current
        ? { current: errObj.current }
        : {}),
    });
    return;
  }

  next(err); // Pass everything else down (e.g., to Sentry and Express default handler)
});

// The error handler must be registered before any other error middleware and after all controllers
Sentry.setupExpressErrorHandler(app);

let server: ReturnType<typeof app.listen> | null = null;

/**
 * docker-compose.yml publishes Postgres on host port 5433 (5432 is usually
 * taken by another project's database). A local .env written before that
 * change still says 5432 and only fails later, deep in Prisma, with a P1001
 * that doesn't mention ports. This says it up front.
 */
const warnIfLocalDatabasePortLooksStale = (): void => {
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (local && (url.port === "" || url.port === "5432")) {
      logger.warn(
        "[Startup] DATABASE_URL points at localhost:5432, but docker-compose.yml publishes Postgres on 5433. " +
          "If the database is the one from `yarn docker`, change the port in plan-ai/backend/.env.",
      );
    }
  } catch {
    // Not a URL we can read; Prisma will report it properly.
  }
};

const startServer = async () => {
  warnIfLocalDatabasePortLooksStale();
  try {
    await initializeContextVectorStore();
    logger.info("Qdrant context collection verified.");
  } catch (error) {
    logger.error("Failed to initialize Qdrant context collection", error);
    process.exit(1);
  }

  // OpenRouter's price list is useless to a self-hosted model and, on a server
  // without internet, would only log errors every hour.
  const selfHostedLlm = getLlmProvider() === "local";
  if (selfHostedLlm) {
    logger.info("[Startup] LLM_PROVIDER=local: OpenRouter pricing sync is off");
  } else {
    try {
      const job = await pricingSyncQueue.add(
        "sync-models",
        {},
        {
          repeat: { pattern: "0 * * * *" },
        },
      );
      logger.info(`Scheduled OpenRouter pricing sync job: ${job.id}`);
    } catch (error) {
      logger.error("Failed to schedule pricing sync job", error);
    }
  }

  try {
    // Mondays at 08:00 server time. `jobId` is fixed so restarting the server
    // re-uses the same repeatable job instead of stacking a new schedule on
    // every deploy (which would send the digest N times).
    const digestJob = await weeklyDigestQueue.add(
      "weekly-digest",
      {},
      { repeat: { pattern: "0 8 * * 1" }, jobId: "weekly-digest-cron" },
    );
    logger.info(`Scheduled weekly digest job: ${digestJob.id}`);
  } catch (error) {
    logger.error("Failed to schedule weekly digest job", error);
  }

  try {
    // Mondays at 08:15 server time, after the personal digest. Fixed jobId
    // so a restart reuses the schedule instead of adding another one.
    const teamJob = await teamReportQueue.add(
      "team-report",
      {},
      { repeat: { pattern: "15 8 * * 1" }, jobId: "team-report-cron" },
    );
    logger.info(`Scheduled team report job: ${teamJob.id}`);
  } catch (error) {
    logger.error("Failed to schedule team report job", error);
  }

  try {
    // Daily at 03:00: slices of recording uploads that never finished.
    // Fixed jobId so restarts reuse the schedule instead of stacking one.
    const cleanupJob = await storageCleanupQueue.add(
      "recording-parts-cleanup",
      {},
      { repeat: { pattern: "0 3 * * *" }, jobId: "recording-parts-cleanup-cron" },
    );
    logger.info(`Scheduled recording parts cleanup job: ${cleanupJob.id}`);
  } catch (error) {
    logger.error("Failed to schedule recording parts cleanup job", error);
  }

  // Initialize in-memory pricing cache (OpenRouter prices; not needed self-hosted)
  if (!selfHostedLlm) await pricingCacheService.init();

  server = app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
    console.log(`Server is running on port ${PORT}`);
    console.log("Healthcheck available at http://localhost:8080/api/healthcheck/status");
    console.log(`API Documentation available at http://localhost:${PORT}/api-docs`);
    console.log(`Qdrant dashboard at ${QDRANT_URL}/dashboard`);
  });

  // Explicitly set high timeouts for long-running AI generation requests (5 minutes)
  server.timeout = 300000;
  server.keepAliveTimeout = 300000;
  server.headersTimeout = 301000;
  // Whole-request limit. Node's default is 5 minutes, which cut long meeting
  // uploads on slow connections even while bytes were still arriving. Idle
  // sockets are still closed after 5 minutes by `server.timeout` above.
  server.requestTimeout = 60 * 60 * 1000;

  // Bind WebSocket server after the HTTP server starts listening
  setupAudioStream(server);
};

void startServer();

// Handle graceful shutdown
/**
 * Longest a shutdown may wait before cutting what's still open. Without it a
 * single long-lived connection (a live audio WebSocket, an MCP stream, an SSE)
 * keeps `server.close()` waiting forever, and a worker in the middle of a job
 * can hold `close()` for minutes. The process then stays alive with the port
 * taken: nodemon's next start fails with EADDRINUSE, and on Railway a deploy
 * waits until the platform kills the old instance.
 */
const SHUTDOWN_GRACE_MS = 10_000;

const closeServer = async (cb?: () => void) => {
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(deadline);
    if (cb) cb();
  };
  const deadline = setTimeout(() => {
    logger.warn(
      `[Shutdown] Still closing after ${SHUTDOWN_GRACE_MS / 1000}s, cutting open connections`,
    );
    server?.closeAllConnections();
    finish();
  }, SHUTDOWN_GRACE_MS);
  deadline.unref();

  logger.info("Closing background workers...");
  await githubContextWorker.close();
  await pricingSyncWorker.close();
  await transcriptGenerationWorker.close();
  await taskRefinementWorker.close();
  await contextDocumentWorker.close();
  await weeklyDigestWorker.close();
  await teamReportWorker.close();
  await storageCleanupWorker.close();
  pricingCacheService.close();

  if (server) {
    server.close(() => {
      logger.info("HTTP server closed");
      finish();
    });
  } else {
    finish();
  }
};

// nodemon restart signal
process.once("SIGUSR2", () => {
  logger.info("SIGUSR2 signal received: nodemon restart");
  closeServer(() => {
    process.kill(process.pid, "SIGUSR2");
  });
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM signal received: closing HTTP server");
  closeServer(() => process.exit(0));
});

process.on("SIGINT", () => {
  logger.info("SIGINT signal received: closing HTTP server");
  closeServer(() => process.exit(0));
});

// Catch unhandled Promise rejections and exceptions that might silently kill tasks
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection", { promise, reason });
  console.error("UNHANDLED REJECTION:", reason);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  console.error("UNCAUGHT EXCEPTION:", error);
});
