import dotenv from "dotenv";
dotenv.config();
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
import { initializeContextVectorStore } from "./vector/contextFileVectorService";
import { setupAudioStream } from "./routes/audioStream";

console.log("Server starting...");
const app = express();
const PORT = EnvUtils.get("PORT") || 8080;
const QDRANT_URL = EnvUtils.get("QDRANT_URL") || "http://127.0.0.1:6333";

// Middlewares
app.use(
  cors({
    origin: "*", // allow all
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: "*", // allow all headers
  }),
);
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));
app.use(bodyParser.json({ limit: "50mb" }));

// Add route logging middleware before registering routes
app.use((req, res, next) => {
  console.debug(`Request received: ${req.method} ${req.path}`);
  next();
});

// Register TSOA routes (with role-based access control)
RegisterRoutes(app);

// Register manual routes
app.use("/api/chat", chatRouter);

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

let server: ReturnType<typeof app.listen> | null = null;

const startServer = async () => {
  try {
    await initializeContextVectorStore();
    logger.info("Qdrant context collection verified.");
  } catch (error) {
    logger.error("Failed to initialize Qdrant context collection", error);
    process.exit(1);
  }

  server = app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
    console.log(`Server is running on port ${PORT}`);
    console.log("Healthcheck available at http://localhost:8080/api/healthcheck/status");
    console.log(`API Documentation available at http://localhost:${PORT}/api-docs`);
    console.log(`Qdrant dashboard at ${QDRANT_URL}/dashboard`);
  });

  // Bind WebSocket server after the HTTP server starts listening
  setupAudioStream(server!);
};

void startServer();

// Handle graceful shutdown
const closeServer = () => {
  if (server) {
    server.close(() => {
      logger.info("HTTP server closed");
    });
  }
};

process.on("SIGTERM", () => {
  logger.info("SIGTERM signal received: closing HTTP server");
  closeServer();
});

process.on("SIGINT", () => {
  logger.info("SIGINT signal received: closing HTTP server");
  closeServer();
});
