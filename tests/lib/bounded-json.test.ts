import test from "node:test";
import assert from "node:assert/strict";
import { readBoundedJson } from "../../lib/security/bounded-json.ts";
import { HttpError } from "../../lib/http-error.ts";

test("bounded JSON accepts a normal request", async () => {
  assert.deepEqual(await readBoundedJson(new Request("http://localhost/", {
    method: "POST", body: JSON.stringify({ ok: true }),
  })), { ok: true });
});

test("bounded JSON rejects oversized request bodies", async () => {
  await assert.rejects(
    () => readBoundedJson(new Request("http://localhost/", { method: "POST", body: "x".repeat(101) }), 100),
    (error: unknown) => error instanceof HttpError && error.status === 413,
  );
});

test("bounded JSON rejects invalid JSON", async () => {
  await assert.rejects(
    () => readBoundedJson(new Request("http://localhost/", { method: "POST", body: "{" })),
    (error: unknown) => error instanceof HttpError && error.status === 400,
  );
});
