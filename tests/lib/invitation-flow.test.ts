import test from "node:test";
import assert from "node:assert/strict";
import {
  confirmInviteToken,
  passwordValidationError,
} from "../../lib/supabase/invitation.ts";

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
