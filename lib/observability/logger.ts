import { getObservabilityContext } from "./context";
import type { LogContext, LogLevel, StructuredLog } from "./types";

function environment(): string {
  return process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";
}

function emit(level: LogLevel, event: string, context: LogContext = {}): void {
  const scoped = getObservabilityContext();
  const payload: StructuredLog = {
    timestamp: new Date().toISOString(),
    level,
    event,
    environment: environment(),
    ...(scoped ?? {}),
    ...context,
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.info(line);
}

export const logger = {
  info(event: string, context?: LogContext) {
    emit("info", event, context);
  },
  warn(event: string, context?: LogContext) {
    emit("warn", event, context);
  },
  error(event: string, context?: LogContext) {
    emit("error", event, context);
  },
};
