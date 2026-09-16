import * as Sentry from "@sentry/nextjs";

type CaptureContext = Parameters<typeof Sentry.captureException>[1];

export function captureException(error: unknown, context?: CaptureContext) {
  if (typeof Sentry.captureException === "function") {
    return Sentry.captureException(error, context);
  }
}

export function captureMessage(message: string, level: "fatal" | "error" | "warning" | "log" | "info" | "debug" = "info") {
  if (typeof Sentry.captureMessage === "function") {
    return Sentry.captureMessage(message, level);
  }
}

export function setTag(key: string, value: string) {
  if (typeof Sentry.setTag === "function") {
    Sentry.setTag(key, value);
  }
}

export function setUser(user: { id: string } | null) {
  if (typeof Sentry.setUser === "function") {
    Sentry.setUser(user);
  }
}
