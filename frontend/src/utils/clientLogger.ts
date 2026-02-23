type LogLevel = "info" | "warn" | "error" | "debug";

type LogPayload = {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
};

const API_BASE_URL = process.env.REACT_APP_API_BACKEND_URL?.replace(/\/$/, "");
const LOG_ENDPOINT = API_BASE_URL ? `${API_BASE_URL}/api/logs/frontend` : null;

const isLoggingEnabled = () => {
  if (!LOG_ENDPOINT) {
    return false;
  }

  const flag = process.env.REACT_APP_ENABLE_REMOTE_LOGS;
  return flag ? flag.toLowerCase() !== "false" : true;
};

const enrichContext = (context?: Record<string, unknown>): Record<string, unknown> | undefined => {
  if (!context) {
    return undefined;
  }

  return { ...context };
};

const sendLog = async (payload: LogPayload) => {
  if (!isLoggingEnabled()) {
    return;
  }

  const enrichedPayload: LogPayload = {
    ...payload,
    context: enrichContext({
      ...payload.context,
      pathname: window.location.pathname,
      search: window.location.search,
      userAgent: window.navigator.userAgent,
    }),
  };

  try {
    if (navigator.sendBeacon && LOG_ENDPOINT) {
      const beaconPayload = JSON.stringify(enrichedPayload);
      const blob = new Blob([beaconPayload], { type: "application/json" });
      navigator.sendBeacon(LOG_ENDPOINT, blob);
      return;
    }

    if (LOG_ENDPOINT) {
      await fetch(LOG_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(enrichedPayload),
        keepalive: true,
      });
    }
  } catch (error) {
    // Swallow logging errors to avoid affecting the UX
    console.debug("Failed to send log to backend", error);
  }
};

const formatErrorContext = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    value: String(error),
  };
};

export const clientLogger = {
  info: (message: string, context?: Record<string, unknown>) =>
    sendLog({ level: "info", message, context }),
  warn: (message: string, context?: Record<string, unknown>) =>
    sendLog({ level: "warn", message, context }),
  error: (message: string, error?: unknown, context?: Record<string, unknown>) =>
    sendLog({
      level: "error",
      message,
      context: { ...(context ?? {}), ...formatErrorContext(error) },
    }),
  debug: (message: string, context?: Record<string, unknown>) =>
    sendLog({ level: "debug", message, context }),
};
