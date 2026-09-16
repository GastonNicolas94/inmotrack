import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { withObservability } from "@/lib/observability/with-observability";

function captureConsole(method: "warn" | "error" | "info") {
  const original = console[method];
  const lines: string[] = [];
  console[method] = ((line: unknown) => lines.push(String(line))) as typeof original;
  return {
    lines,
    restore() {
      console[method] = original;
    },
  };
}

test("withObservability propagates x-request-id without logging successful requests", async () => {
  const capture = captureConsole("info");
  try {
    const handler = withObservability(async () => Response.json({ ok: true }));
    const request = new NextRequest("http://localhost/api/v1/test", {
      headers: { "x-request-id": "req-123" },
    });

    const response = await handler(request, undefined);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-request-id"), "req-123");
    assert.equal(capture.lines.length, 0);
  } finally {
    capture.restore();
  }
});

test("withObservability logs sanitized request and response for 4xx", async () => {
  const capture = captureConsole("warn");
  try {
    const handler = withObservability(async () =>
      Response.json({ error: "invalid", token: "response-secret" }, { status: 422 }),
    );
    const request = new NextRequest("http://localhost/api/v1/test", {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "req-422" },
      body: JSON.stringify({ password: "secret", amount: 10 }),
    });

    const response = await handler(request, undefined);
    assert.equal(response.status, 422);
    assert.equal(capture.lines.length, 1);
    const log = JSON.parse(capture.lines[0]);
    assert.equal(log.event, "http.request.failed");
    assert.equal(log.requestId, "req-422");
    assert.equal(log.requestBody.password, "[REDACTED]");
    assert.equal(log.requestBody.amount, 10);
    assert.equal(log.responseBody.token, "[REDACTED]");
  } finally {
    capture.restore();
  }
});

test("withObservability logs 5xx at error level", async () => {
  const capture = captureConsole("error");
  try {
    const handler = withObservability(async () => Response.json({ error: "boom" }, { status: 500 }));
    const request = new NextRequest("http://localhost/api/v1/test", {
      headers: { "x-request-id": "req-500" },
    });

    await handler(request, undefined);
    assert.equal(capture.lines.length, 1);
    const log = JSON.parse(capture.lines[0]);
    assert.equal(log.level, "error");
    assert.equal(log.status, 500);
  } finally {
    capture.restore();
  }
});

test("withObservability logs and rethrows unhandled errors", async () => {
  const capture = captureConsole("error");
  try {
    const handler = withObservability(async () => {
      throw new Error("unexpected");
    });
    const request = new NextRequest("http://localhost/api/v1/test");

    await assert.rejects(() => handler(request, undefined), /unexpected/);
    assert.equal(capture.lines.length, 1);
    assert.equal(JSON.parse(capture.lines[0]).event, "http.request.unhandled_error");
  } finally {
    capture.restore();
  }
});
