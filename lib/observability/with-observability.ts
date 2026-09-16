import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { NextRequest } from "next/server";
import { logger } from "@/lib/observability/logger";
import { getObservabilityContext, runWithObservabilityContext } from "@/lib/observability/context";
import { getOrCreateRequestId } from "@/lib/observability/request-id";
import { sanitizeForLogging } from "@/lib/observability/sanitizer";

const SLOW_REQUEST_THRESHOLD_MS = Number(process.env.SLOW_REQUEST_THRESHOLD_MS ?? 2000);

type RouteHandler<TContext = unknown> = (
  request: NextRequest,
  context: TContext,
) => Response | Promise<Response>;

async function readRequestBody(request: NextRequest): Promise<unknown> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const contentType = request.headers.get("content-type");
  if (!contentType) return undefined;

  const clone = request.clone();
  try {
    if (contentType.includes("application/json")) return await clone.json();
    return await clone.text();
  } catch {
    return { unreadable: true };
  }
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type");
  if (!contentType) return undefined;

  if (
    contentType.includes("application/pdf") ||
    contentType.includes("application/octet-stream") ||
    contentType.includes("image/") ||
    contentType.includes("audio/") ||
    contentType.includes("video/")
  ) {
    return { omitted: true, reason: "unsupported_content_type" };
  }

  const clone = response.clone();
  try {
    if (contentType.includes("application/json")) return await clone.json();
    return await clone.text();
  } catch {
    return { unreadable: true };
  }
}

function attachRequestId(response: Response, requestId: string): Response {
  response.headers.set("x-request-id", requestId);
  return response;
}

function configureSentryScope(params: {
  requestId: string;
  method: string;
  path: string;
  status: number;
  userId?: number;
}) {
  Sentry.setTag("request_id", params.requestId);
  Sentry.setTag("http.method", params.method);
  Sentry.setTag("http.route", params.path);
  Sentry.setTag("http.status_code", String(params.status));
  if (params.userId) Sentry.setUser({ id: String(params.userId) });
}

export function withObservability<TContext = unknown>(
  handler: RouteHandler<TContext>,
): RouteHandler<TContext> {
  return async (request, context) => {
    const requestId = getOrCreateRequestId(request.headers);
    const startedAt = performance.now();
    const path = request.nextUrl.pathname;
    const requestBodyPromise = readRequestBody(request);

    return runWithObservabilityContext(
      { requestId, method: request.method, path },
      async () => {
        try {
          const response = attachRequestId(await handler(request, context), requestId);
          const durationMs = Math.round(performance.now() - startedAt);
          const scoped = getObservabilityContext();
          const common = {
            requestId,
            method: request.method,
            path,
            status: response.status,
            durationMs,
            userId: scoped?.userId,
          };

          if (response.status >= 400) {
            const [requestBody, responseBody] = await Promise.all([
              requestBodyPromise,
              readResponseBody(response),
            ]);
            const payload = {
              ...common,
              requestBody: sanitizeForLogging(requestBody, {
                contentType: request.headers.get("content-type"),
              }),
              responseBody: sanitizeForLogging(responseBody, {
                contentType: response.headers.get("content-type"),
              }),
            };

            if (response.status >= 500) {
              logger.error("http.request.failed", payload);
              configureSentryScope({
                requestId,
                method: request.method,
                path,
                status: response.status,
                userId: scoped?.userId,
              });
              Sentry.captureMessage(`HTTP ${response.status} ${request.method} ${path}`, "error");
            } else {
              logger.warn("http.request.failed", payload);
            }
          } else if (durationMs > SLOW_REQUEST_THRESHOLD_MS) {
            logger.warn("http.request.slow", common);
          }

          return response;
        } catch (error) {
          const durationMs = Math.round(performance.now() - startedAt);
          const scoped = getObservabilityContext();
          logger.error("http.request.unhandled_error", {
            requestId,
            method: request.method,
            path,
            status: 500,
            durationMs,
            userId: scoped?.userId,
            error:
              error instanceof Error
                ? { name: error.name, message: error.message, stack: error.stack }
                : { message: String(error) },
          });
          configureSentryScope({
            requestId,
            method: request.method,
            path,
            status: 500,
            userId: scoped?.userId,
          });
          Sentry.captureException(error);
          throw error;
        }
      },
    );
  };
}
