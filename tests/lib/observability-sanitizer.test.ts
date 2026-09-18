import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeForLogging } from "@/lib/observability/sanitizer";

test("sanitizeForLogging redacts sensitive fields recursively", () => {
  const result = sanitizeForLogging({
    password: "secret",
    profile: {
      access_token: "token-value",
      email: "persona@example.com",
    },
  });

  assert.deepEqual(result, {
    password: "[REDACTED]",
    profile: {
      access_token: "[REDACTED]",
      email: "persona@example.com",
    },
  });
});

test("sanitizeForLogging redacts sensitive headers", () => {
  const headers = new Headers({
    authorization: "Bearer secret",
    cookie: "session=secret",
    "x-request-id": "abc",
  });

  assert.deepEqual(sanitizeForLogging(headers), {
    authorization: "[REDACTED]",
    cookie: "[REDACTED]",
    "x-request-id": "abc",
  });
});

test("sanitizeForLogging omits binary and multipart content", () => {
  assert.deepEqual(
    sanitizeForLogging({ file: "secret" }, { contentType: "multipart/form-data; boundary=x" }),
    { omitted: true, reason: "unsupported_content_type" },
  );
});

test("sanitizeForLogging truncates oversized payloads", () => {
  const result = sanitizeForLogging({ payload: "x".repeat(100) }, { maxBytes: 32 });
  assert.equal(typeof result, "object");
  assert.equal((result as { truncated: boolean }).truncated, true);
  assert.ok((result as { originalSize: number }).originalSize > 32);
});

test("sanitizeForLogging preserves undefined payloads", () => {
  assert.equal(sanitizeForLogging(undefined), undefined);
});
