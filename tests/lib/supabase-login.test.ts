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
