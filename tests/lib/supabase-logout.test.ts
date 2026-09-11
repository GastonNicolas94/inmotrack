import test from "node:test";
import assert from "node:assert/strict";
import { signOutAndRedirect } from "../../lib/supabase/logout.ts";
import { HttpError } from "../../lib/http-error.ts";

test("signOutAndRedirect redirects only after Supabase confirms sign out", async () => {
  const calls: string[] = [];
  await signOutAndRedirect(
    (path) => {
      calls.push(path);
    },
    async () => ({ auth: { signOut: async () => ({ error: null }) } }),
    "/login",
  );
  assert.deepEqual(calls, ["/login"]);
});

test("signOutAndRedirect fails closed and does not redirect on Supabase error", async () => {
  let redirected = false;
  await assert.rejects(
    () =>
      signOutAndRedirect(
        () => {
          redirected = true;
        },
        async () => ({ auth: { signOut: async () => ({ error: new Error("offline") }) } }),
        "/login",
      ),
    (error: unknown) =>
      error instanceof HttpError &&
      error.code === "LOGOUT_FAILED" &&
      error.status === 500 &&
      error.message === "No se pudo cerrar sesión.",
  );
  assert.equal(redirected, false);
});
