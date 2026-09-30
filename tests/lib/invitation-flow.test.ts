import test from "node:test";
import assert from "node:assert/strict";
import {
  confirmInviteToken,
  confirmDefaultInvite,
  passwordValidationError,
  passwordEmailCallbackPath,
} from "../../lib/supabase/invitation.ts";

test("password emails landing at login keep their session and reach the callback", () => {
  for (const type of ["invite", "recovery"]) {
    const hash = `#access_token=a&refresh_token=r&type=${type}`;
    assert.equal(passwordEmailCallbackPath(hash), `/auth/confirm/callback${hash}`);
  }
  for (const hash of ["", "#next=https://evil.example", "#access_token=a&type=invite", "#access_token=a&refresh_token=r&type=signup"]) {
    assert.equal(passwordEmailCallbackPath(hash), null);
  }
});

test("a confirmed user can establish a password through a recovery email", async () => {
  assert.equal(await confirmDefaultInvite("#access_token=a&refresh_token=r&type=recovery", () => {}, () => ({ auth: {
    async setSession() { return { data: { session: {} }, error: null }; },
    async getUser() { return { data: { user: { id: "confirmed-user" } }, error: null }; },
  } })), true);
});

test("default invites clear credentials before validating the returned session", async () => {
  const order: string[] = [];
  const verified = await confirmDefaultInvite(
    "#access_token=access&refresh_token=refresh&type=invite",
    () => { order.push("cleared"); },
    () => {
      order.push("client");
      return { auth: {
        async setSession(input: unknown) {
          assert.deepEqual(input, { access_token: "access", refresh_token: "refresh" });
          order.push("session");
          return { data: { session: {} }, error: null };
        },
        async getUser() {
          order.push("user");
          return { data: { user: { id: "invited-user" } }, error: null };
        },
      } };
    },
  );
  assert.equal(verified, true);
  assert.deepEqual(order, ["cleared", "client", "session", "user"]);
});

test("default invites fail closed for missing, wrong-type or expired credentials", async () => {
  for (const fragment of ["", "#type=invite&access_token=access", "#type=signup&access_token=a&refresh_token=r", "#error=access_denied&error_description=private"]) {
    let cleared = false;
    assert.equal(await confirmDefaultInvite(fragment, () => { cleared = true; }, () => { throw new Error("should not create client"); }), false);
    assert.equal(cleared, true);
  }
  for (const failure of ["session", "user", "throw"]) {
    assert.equal(await confirmDefaultInvite("#type=invite&access_token=a&refresh_token=r", () => {}, () => ({ auth: {
      async setSession() {
        if (failure === "throw") throw new Error("private");
        return { data: { session: failure === "session" ? null : {} }, error: failure === "session" ? {} : null };
      },
      async getUser() { return { data: { user: null }, error: {} }; },
    } })), false);
  }
});

function client(result: unknown) {
  const calls: unknown[] = [];
  return {
    calls,
    auth: {
      async verifyOtp(input: unknown) {
        calls.push(input);
        return result;
      },
    },
  };
}

test("confirmInviteToken verifies only invite token hashes and requires a session", async () => {
  const successful = client({ data: { session: { access_token: "opaque" } }, error: null });
  assert.equal(await confirmInviteToken(successful, "invite-hash", "invite"), true);
  assert.deepEqual(successful.calls, [{ token_hash: "invite-hash", type: "invite" }]);

  const wrongType = client({ data: { session: {} }, error: null });
  assert.equal(await confirmInviteToken(wrongType, "invite-hash", "recovery"), false);
  assert.deepEqual(wrongType.calls, []);

  const noSession = client({ data: { session: null }, error: null });
  assert.equal(await confirmInviteToken(noSession, "invite-hash", "invite"), false);
  const failed = client({ data: null, error: { message: "private auth error" } });
  assert.equal(await confirmInviteToken(failed, "invite-hash", "invite"), false);
  assert.equal(await confirmInviteToken(failed, "", "invite"), false);
  const throws = {
    auth: { verifyOtp: async () => { throw new Error("private auth error"); } },
  };
  assert.equal(await confirmInviteToken(throws, "invite-hash", "invite"), false);
});

test("passwordValidationError enforces a password and matching confirmation", () => {
  assert.equal(passwordValidationError("", ""), "Ingresá una contraseña.");
  assert.equal(passwordValidationError("short", "short"), "La contraseña debe tener al menos 8 caracteres.");
  assert.equal(passwordValidationError("valid-password", "different"), "Las contraseñas no coinciden.");
  assert.equal(passwordValidationError("valid-password", "valid-password"), null);
});
