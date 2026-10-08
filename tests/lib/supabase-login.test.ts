import test from "node:test";
import assert from "node:assert/strict";
import { loginAndRedirect, signInWithPassword } from "../../lib/supabase/login.ts";

test("signInWithPassword forwards credentials to the browser auth client", async () => {
  let received: { email: string; password: string } | undefined;
  const result = await signInWithPassword("user@example.com", "secret", () => ({
    auth: {
      signInWithPassword: async (credentials) => {
        received = credentials;
        return { error: null };
      },
    },
  }));
  assert.deepEqual(received, { email: "user@example.com", password: "secret" });
  assert.equal(result.error, null);
});

test("signInWithPassword returns Supabase authentication errors", async () => {
  const authError = new Error("invalid credentials");
  const result = await signInWithPassword("user@example.com", "wrong", () => ({
    auth: {
      signInWithPassword: async () => ({ error: authError }),
    },
  }));
  assert.equal(result.error, authError);
});

test("loginAndRedirect navigates only after successful authentication", async () => {
  const calls: string[] = [];
  const loggedIn = await loginAndRedirect(
    "user@example.com",
    "secret",
    { replace: (path) => calls.push(`replace:${path}`), refresh: () => calls.push("refresh") },
    async () => ({ error: null }),
  );
  assert.equal(loggedIn, true);
  assert.deepEqual(calls, ["replace:/contratos", "refresh"]);
});

test("loginAndRedirect does not navigate after an authentication error", async () => {
  const calls: string[] = [];
  const loggedIn = await loginAndRedirect(
    "user@example.com",
    "wrong",
    { replace: (path) => calls.push(`replace:${path}`), refresh: () => calls.push("refresh") },
    async () => ({ error: new Error("invalid credentials") }),
  );
  assert.equal(loggedIn, false);
  assert.deepEqual(calls, []);
});

test("loginAndRedirect signals successful auth before starting navigation", async () => {
  const calls: string[] = [];
  const ok = await loginAndRedirect(
    "user@example.com",
    "secret",
    { replace: (path) => calls.push(`replace:${path}`), refresh: () => calls.push("refresh") },
    async () => ({ error: null }),
    () => calls.push("authenticated"),
  );
  assert.equal(ok, true);
  assert.deepEqual(calls, ["authenticated", "replace:/contratos", "refresh"]);
});

test("loginAndRedirect never shows redirecting state for rejected credentials", async () => {
  const calls: string[] = [];
  const ok = await loginAndRedirect(
    "user@example.com",
    "incorrect",
    { replace: () => calls.push("replace"), refresh: () => calls.push("refresh") },
    async () => ({ error: new Error("Invalid") }),
    () => calls.push("authenticated"),
  );
  assert.equal(ok, false);
  assert.deepEqual(calls, []);
});
