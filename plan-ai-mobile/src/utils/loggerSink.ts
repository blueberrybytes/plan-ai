/* eslint-disable @typescript-eslint/no-unused-vars */
export interface LogEntry {
  timestamp: string;
  type: "log" | "warn" | "error";
  message: string;
}

export const memoryLogSink: LogEntry[] = [];

const safeStringify = (obj: any): string => {
  if (typeof obj === "string") return obj;
  if (obj instanceof Error) return `${obj.name}: ${obj.message}\n${obj.stack}`;
  try {
    return JSON.stringify(
      obj,
      (key, value) => {
        if (typeof value === "function") return "[Function]";
        if (value instanceof Error) return `${value.name}: ${value.message}`;
        return value;
      },
      2
    );
  } catch (e) {
    return String(obj);
  }
};

let initialized = false;

export const initLoggerSink = () => {
  if (initialized) return;
  initialized = true;

  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;

  const proxyConsole = (
    type: "log" | "warn" | "error",
    originalFn: (...args: any[]) => void,
    ...args: any[]
  ) => {
    const message = args.map((arg) => safeStringify(arg)).join(" ");
    memoryLogSink.push({
      timestamp: new Date().toISOString(),
      type,
      message,
    });
    // Keep memory tight
    if (memoryLogSink.length > 200) memoryLogSink.shift();
    originalFn(...args);
  };

  console.log = (...args) => proxyConsole("log", originalConsoleLog, ...args);
  console.warn = (...args) => proxyConsole("warn", originalConsoleWarn, ...args);
  console.error = (...args) => proxyConsole("error", originalConsoleError, ...args);
};

export const getLogSink = () => [...memoryLogSink];
