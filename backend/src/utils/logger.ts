import { Logging, Log } from "@google-cloud/logging";
import EnvUtils from "./EnvUtils";

// Log levels
enum LogLevel {
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  DEBUG = "DEBUG",
}

class Logger {
  private gcpLog: Log | null = null;
  private gcpInitialized = false;
  private readonly logToGcp: boolean;
  private readonly minLevel: LogLevel;
  private static readonly LEVEL_ORDER: LogLevel[] = [
    LogLevel.DEBUG,
    LogLevel.INFO,
    LogLevel.WARN,
    LogLevel.ERROR,
  ];

  constructor() {
    this.logToGcp = EnvUtils.get("LOG_TO_GCP", "false").toLowerCase() === "true";
    this.minLevel = this.parseLevel(EnvUtils.get("LOG_LEVEL", "info"));
  }

  private initGcpIfNeeded(): void {
    if (this.gcpInitialized || !this.logToGcp) {
      return;
    }

    this.gcpInitialized = true;

    const envRaw = EnvUtils.get("ENV", "");
    const envName = envRaw || "local";
    if (!envRaw || envName === "local") {
      return;
    }

    const serviceKeyBase64 = EnvUtils.get("GOOGLE_LOGS_SERVICE_KEY", "");
    if (!serviceKeyBase64) {
      return;
    }

    try {
      const parsed = JSON.parse(Buffer.from(serviceKeyBase64, "base64").toString()) as {
        project_id: string;
        client_email: string;
        private_key: string;
      };

      const logging = new Logging({
        projectId: parsed.project_id,
        credentials: {
          client_email: parsed.client_email,
          private_key: parsed.private_key,
        },
      });

      const logName = `plan-ai-backend-api-${envName}`;
      this.gcpLog = logging.log(logName);
    } catch {
      this.gcpLog = null;
    }
  }

  private parseLevel(value: string): LogLevel {
    const normalized = value.toLowerCase();
    switch (normalized) {
      case "debug":
        return LogLevel.DEBUG;
      case "warn":
        return LogLevel.WARN;
      case "error":
        return LogLevel.ERROR;
      case "info":
      default:
        return LogLevel.INFO;
    }
  }

  private isLevelEnabled(level: LogLevel): boolean {
    const currentIndex = Logger.LEVEL_ORDER.indexOf(level);
    const thresholdIndex = Logger.LEVEL_ORDER.indexOf(this.minLevel);
    if (currentIndex === -1 || thresholdIndex === -1) {
      return true;
    }
    return currentIndex >= thresholdIndex;
  }

  private levelToSeverity(level: LogLevel): "DEBUG" | "INFO" | "WARNING" | "ERROR" {
    switch (level) {
      case LogLevel.WARN:
        return "WARNING";
      case LogLevel.ERROR:
        return "ERROR";
      case LogLevel.DEBUG:
        return "DEBUG";
      case LogLevel.INFO:
      default:
        return "INFO";
    }
  }

  public info(message: string, context?: Record<string, unknown>): void {
    if (!this.isLevelEnabled(LogLevel.INFO)) {
      return;
    }

    this.log(LogLevel.INFO, message, context);
  }

  public warn(
    message: string,
    errorOrContext?: unknown,
    contextMaybe?: Record<string, unknown>,
  ): void {
    if (!this.isLevelEnabled(LogLevel.WARN)) {
      return;
    }

    let error: unknown;
    let context: Record<string, unknown> | undefined;

    if (errorOrContext instanceof Error) {
      error = errorOrContext;
      context = contextMaybe;
    } else if (this.isPlainRecord(errorOrContext)) {
      context = errorOrContext as Record<string, unknown>;
      error = contextMaybe;
    } else if (errorOrContext !== undefined) {
      error = errorOrContext;
      context = contextMaybe;
    } else {
      context = contextMaybe;
    }

    const additional = {
      ...(context ?? {}),
      ...(error ? this.toErrorFields(error) : {}),
    } as Record<string, unknown> | undefined;

    this.log(LogLevel.WARN, message, additional);
    if (error) {
      console.warn(error);
    }
  }

  public error(
    message: string,
    errorOrContext?: unknown,
    contextMaybe?: Record<string, unknown>,
  ): void {
    if (!this.isLevelEnabled(LogLevel.ERROR)) {
      return;
    }

    let error: unknown;
    let context: Record<string, unknown> | undefined;

    if (errorOrContext instanceof Error) {
      error = errorOrContext;
      context = contextMaybe;
    } else if (this.isPlainRecord(errorOrContext)) {
      context = errorOrContext as Record<string, unknown>;
      error = contextMaybe;
    } else if (errorOrContext !== undefined) {
      error = errorOrContext;
      context = contextMaybe;
    } else {
      context = contextMaybe;
    }

    const additional = {
      ...(context ?? {}),
      ...(error ? this.toErrorFields(error) : {}),
    } as Record<string, unknown> | undefined;

    this.log(LogLevel.ERROR, message, additional);
    if (error) {
      console.error(error);
    }
  }

  public debug(message: string, context?: Record<string, unknown>): void {
    if (!this.isLevelEnabled(LogLevel.DEBUG)) {
      return;
    }

    if (process.env.NODE_ENV === "production" && this.minLevel !== LogLevel.DEBUG) {
      return;
    }

    this.log(LogLevel.DEBUG, message, context);
  }

  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !(value instanceof Error);
  }

  private log(level: LogLevel, message: string, additional?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const suffix =
      additional && Object.keys(additional).length > 0 ? ` ${JSON.stringify(additional)}` : "";
    console.log(`[${timestamp}] [${level}] ${message}${suffix}`);

    void this.writeToGcp(level, message, additional);
  }

  private toErrorFields(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
      return {
        errorMessage: error.message,
        errorStack: error.stack ?? null,
        errorName: error.name,
      };
    }

    return { error: String(error) };
  }

  private async writeToGcp(
    level: LogLevel,
    message: string,
    additional?: Record<string, unknown>,
  ): Promise<void> {
    this.initGcpIfNeeded();
    if (!this.gcpLog) {
      return;
    }

    try {
      const metadata = {
        resource: { type: "global" },
        severity: this.levelToSeverity(level),
      } as const;
      const payload = { message, ...additional };
      const entry = this.gcpLog.entry(metadata, payload);
      await this.gcpLog.write(entry);
    } catch {
      // Never throw from logger
    }
  }
}

export const logger = new Logger();
