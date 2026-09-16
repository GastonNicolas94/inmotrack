import assert from "node:assert/strict";
import test from "node:test";
import { getOrCreateRequestId } from "@/lib/observability/request-id";

test("getOrCreateRequestId reuses a valid incoming id", () => {
  const headers = new Headers({ "x-request-id": "request-123" });
  assert.equal(getOrCreateRequestId(headers), "request-123");
});

test("getOrCreateRequestId generates an id when missing", () => {
  const requestId = getOrCreateRequestId(new Headers());
  assert.match(requestId, /^[0-9a-f-]{36}$/i);
});

test("getOrCreateRequestId replaces excessively long ids", () => {
  const headers = new Headers({ "x-request-id": "x".repeat(129) });
  assert.notEqual(getOrCreateRequestId(headers), "x".repeat(129));
});
