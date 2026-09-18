import * as Sentry from "@sentry/nextjs";
import { getObservabilityContext } from "@/lib/observability/context-store";

type SpanOptions = Parameters<typeof Sentry.startSpan>[0];

export function traceSpan<T>(options: SpanOptions, callback: () => T): T {
  return Sentry.startSpan(options, callback) as T;
}

export function traceAttributes(): Record<string, string | number> {
  const context = getObservabilityContext();
  if (!context) return {};

  return {
    "inmotrack.request_id": context.requestId,
    "http.request.method": context.method,
    "http.route": context.path,
    ...(context.userId ? { "user.id": context.userId } : {}),
  };
}

export function traceServiceObject<T extends object>(serviceName: string, service: T): T {
  const wrapped = new Map<PropertyKey, unknown>();

  return new Proxy(service, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;

      const cached = wrapped.get(property);
      if (cached) return cached;

      const traced = (...args: unknown[]) =>
        traceSpan(
          {
            name: `${serviceName}.${String(property)}`,
            op: "service",
            attributes: traceAttributes(),
          },
          () => Reflect.apply(value, target, args),
        );

      wrapped.set(property, traced);
      return traced;
    },
  });
}
