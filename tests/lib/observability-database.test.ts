import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SLOW_QUERY_THRESHOLD_MS,
  isSlowQuery,
  slowQueryThresholdMs,
} from "@/lib/observability/database";

test("isSlowQuery uses the configured threshold boundary", () => {
  assert.equal(isSlowQuery(999, 1000), false);
  assert.equal(isSlowQuery(1000, 1000), true);
  assert.equal(isSlowQuery(1500, 1000), true);
});

test("isSlowQuery rejects non-finite durations", () => {
  assert.equal(isSlowQuery(Number.NaN, 1000), false);
  assert.equal(isSlowQuery(Number.POSITIVE_INFINITY, 1000), false);
});

test("slowQueryThresholdMs falls back for invalid configuration", () => {
  const previous = process.env.SLOW_QUERY_THRESHOLD_MS;
  process.env.SLOW_QUERY_THRESHOLD_MS = "invalid";
  try {
    assert.equal(slowQueryThresholdMs(), DEFAULT_SLOW_QUERY_THRESHOLD_MS);
  } finally {
    if (previous === undefined) delete process.env.SLOW_QUERY_THRESHOLD_MS;
    else process.env.SLOW_QUERY_THRESHOLD_MS = previous;
  }
});
