import test from "node:test";
import assert from "node:assert/strict";
import {
  assertLocalTestDatabase,
  requireDatabaseUrl,
  requireDirectUrl,
} from "@/lib/database-url";

const destructiveTestEnv = { INMOTRACK_ALLOW_DESTRUCTIVE_TESTS: "1" };

test("requireDatabaseUrl rejects a missing or blank value", () => {
  assert.throws(() => requireDatabaseUrl({}), /DATABASE_URL/);
  assert.throws(() => requireDatabaseUrl({ DATABASE_URL: "   " }), /DATABASE_URL/);
});

test("requireDatabaseUrl returns a trimmed value", () => {
  assert.equal(
    requireDatabaseUrl({ DATABASE_URL: "  postgresql://localhost/db  " }),
    "postgresql://localhost/db"
  );
});

test("requireDatabaseUrl reads process.env by default", () => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "  postgresql://localhost/default  ";
  try {
    assert.equal(requireDatabaseUrl(), "postgresql://localhost/default");
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

test("requireDirectUrl rejects a missing or blank value", () => {
  assert.throws(() => requireDirectUrl({}), /DIRECT_URL/);
  assert.throws(() => requireDirectUrl({ DIRECT_URL: "   " }), /DIRECT_URL/);
});

test("requireDirectUrl returns a trimmed value", () => {
  assert.equal(
    requireDirectUrl({ DIRECT_URL: "  postgresql://localhost/direct  " }),
    "postgresql://localhost/direct"
  );
});

test("requireDirectUrl reads process.env by default", () => {
  const previous = process.env.DIRECT_URL;
  process.env.DIRECT_URL = "  postgresql://localhost/default-direct  ";
  try {
    assert.equal(requireDirectUrl(), "postgresql://localhost/default-direct");
  } finally {
    if (previous === undefined) delete process.env.DIRECT_URL;
    else process.env.DIRECT_URL = previous;
  }
});

test("destructive tests reject an absent authorization marker before parsing the URL", () => {
  assert.throws(
    () => assertLocalTestDatabase("not a URL", {}),
    /INMOTRACK_ALLOW_DESTRUCTIVE_TESTS/
  );
});

test("destructive tests reject an incorrect authorization marker", () => {
  assert.throws(
    () =>
      assertLocalTestDatabase("postgresql://postgres:postgres@127.0.0.1:54322/postgres", {
        INMOTRACK_ALLOW_DESTRUCTIVE_TESTS: "0",
      }),
    /INMOTRACK_ALLOW_DESTRUCTIVE_TESTS/
  );
});

test("destructive tests accept Supabase local on 127.0.0.1 with an explicit marker", () => {
  assert.doesNotThrow(() =>
    assertLocalTestDatabase(
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      destructiveTestEnv
    )
  );
});

test("destructive tests accept Supabase local on localhost with an explicit marker", () => {
  assert.doesNotThrow(() =>
    assertLocalTestDatabase(
      "postgresql://postgres:postgres@localhost:54322/postgres",
      destructiveTestEnv
    )
  );
});

test("destructive tests read the authorization marker from process.env by default", () => {
  const previous = process.env.INMOTRACK_ALLOW_DESTRUCTIVE_TESTS;
  process.env.INMOTRACK_ALLOW_DESTRUCTIVE_TESTS = "1";
  try {
    assert.doesNotThrow(() =>
      assertLocalTestDatabase("postgresql://postgres:postgres@127.0.0.1:54322/postgres")
    );
  } finally {
    if (previous === undefined) delete process.env.INMOTRACK_ALLOW_DESTRUCTIVE_TESTS;
    else process.env.INMOTRACK_ALLOW_DESTRUCTIVE_TESTS = previous;
  }
});

test("destructive tests reject remote hosts", () => {
  assert.throws(() =>
    assertLocalTestDatabase(
      "postgresql://postgres.ref:secret@sa-east-1.pooler.supabase.com:6543/postgres",
      destructiveTestEnv
    )
  );
});

test("destructive tests reject localhost with the wrong port", () => {
  assert.throws(() =>
    assertLocalTestDatabase("postgresql://postgres@localhost:5432/postgres", destructiveTestEnv)
  );
});

test("destructive tests reject localhost with the wrong database path", () => {
  assert.throws(() =>
    assertLocalTestDatabase("postgresql://postgres@localhost:54322/inmotrack", destructiveTestEnv)
  );
});

test("destructive tests reject query parameters that override the endpoint", () => {
  assert.throws(() =>
    assertLocalTestDatabase(
      "postgresql://postgres:postgres@localhost:54322/postgres?host=remote.example&port=5432",
      destructiveTestEnv
    )
  );
});

test("destructive tests reject malformed URLs after authorization", () => {
  assert.throws(() => assertLocalTestDatabase("not a URL", destructiveTestEnv));
});
