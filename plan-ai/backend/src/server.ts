import dotenv from "dotenv";
dotenv.config();
import "./sentry/sentry";
import express, { RequestHandler } from "express";
import bodyParser from "body-parser";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import swaggerDocument from "./swagger/swagger.json";
import path from "path";
import EnvUtils from "./utils/EnvUtils";
import { logger } from "./utils/logger";
import { RegisterRoutes } from "./routes/routes";
import chatRouter from "./routes/chatRouter";
import chatStreamingRouter from "./routes/chatStreamingRouter";
import gitnexusRouter from "./routes/gitnexusRouter";
import { initializeContextVectorStore } from "./vector/contextFileVectorService";
import { setupAudioStream } from "./routes/audioStream";
import { microsoftMobileStart, microsoftMobileCallback } from "./controller/sessionController";
// Initialize background workers
import { githubContextWorker } from "./workers/githubContextWorker";
import { githubContextQueue } from "./queue/githubContextQueue";
import { pricingSyncWorker } from "./workers/pricingSyncWorker";
import { pricingSyncQueue } from "./queue/pricingSyncQueue";
import { transcriptGenerationWorker } from "./workers/transcriptGenerationWorker";
import { transcriptGenerationQueue } from "./queue/transcriptGenerationQueue";
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
app.use(
  cors({
    origin: "*", // allow all
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: "*", // allow all headers
  }),
);
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));
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
  console.debug(`Request received: ${req.method} ${req.path}`);
  next();
});

// Disable browser caching for all API responses
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

// Register TSOA routes (with role-based access control and increased upload limits)


RegisterRoutes(app, {
  multer: multer({
    limits: {
      fileSize: 524288000, // 500MB
    },
  }),
});

// Register manual routes
app.use("/api/chat", chatRouter);
app.use("/api/chat-streaming", chatStreamingRouter);
app.use(gitnexusRouter);

// Microsoft Mobile OAuth (not TSOA — these must redirect, not return JSON)
app.get("/api/auth/microsoft/mobile-start", microsoftMobileStart);
app.get("/api/auth/microsoft/mobile-callback", microsoftMobileCallback);

// Add a catch-all route for debugging
app.use((req, res, next) => {
  console.warn(`No route matched: ${req.method} ${req.path}`);
  next();
});

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

// Setup Bull Board UI
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");
createBullBoard({
  queues: [
    new BullMQAdapter(githubContextQueue),
    new BullMQAdapter(pricingSyncQueue),
    new BullMQAdapter(transcriptGenerationQueue),
    new BullMQAdapter(contextDocumentQueue),
  ],
  serverAdapter: serverAdapter,
});

const basicAuthMiddleware = basicAuth({
  users: {
    [EnvUtils.get("BULL_BOARD_USER") || "admin"]: EnvUtils.get("BULL_BOARD_PASSWORD") || "admin",
  },
  challenge: true,
});

app.use("/admin/queues", basicAuthMiddleware, serverAdapter.getRouter());

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
    const errObj = err as { status: number; message: string };
    console.warn(`[Controller Error] ${errObj.status}: ${errObj.message}`);
    res.status(errObj.status).json({ message: errObj.message });
    return;
  }

  next(err); // Pass everything else down (e.g., to Sentry and Express default handler)
});

// The error handler must be registered before any other error middleware and after all controllers
Sentry.setupExpressErrorHandler(app);

let server: ReturnType<typeof app.listen> | null = null;

const startServer = async () => {
  try {
    await initializeContextVectorStore();
    logger.info("Qdrant context collection verified.");
  } catch (error) {
    logger.error("Failed to initialize Qdrant context collection", error);
    process.exit(1);
  }

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

  // Initialize in-memory pricing cache
  await pricingCacheService.init();

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

  // Bind WebSocket server after the HTTP server starts listening
  setupAudioStream(server);
};

void startServer();

// Handle graceful shutdown
const closeServer = async (cb?: () => void) => {
  logger.info("Closing background workers...");
  await githubContextWorker.close();
  await pricingSyncWorker.close();
  await transcriptGenerationWorker.close();
  await contextDocumentWorker.close();
  pricingCacheService.close();

  if (server) {
    server.close(() => {
      logger.info("HTTP server closed");
      if (cb) cb();
    });
  } else {
    if (cb) cb();
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
