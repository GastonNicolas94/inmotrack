export type LogLevel = "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

export type StructuredLog = LogContext & {
  timestamp: string;
  level: LogLevel;
  event: string;
  environment: string;
};
