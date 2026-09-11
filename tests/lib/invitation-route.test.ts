import test from "node:test";
import assert from "node:assert/strict";
import { confirmInvitation, GET } from "../../app/auth/confirm/route.ts";

test("confirmInvitation rejects malformed callbacks without calling Auth", async () => {
  let called = false;
  const response = await confirmInvitation(new Request("http://localhost/auth/confirm?type=recovery"), async () => {
    called = true;
    throw new Error("must not call Auth");
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "http://localhost/login?error=invite_invalid");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(called, false);
});

test("the route export delegates malformed requests to the same safe response", async () => {
  const response = await GET(new Request("http://localhost/auth/confirm"));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "http://localhost/login?error=invite_invalid");
});

test("confirmInvitation verifies the invite and redirects to password setup", async () => {
  const calls: unknown[] = [];
  const response = await confirmInvitation(
    new Request("http://localhost/auth/confirm?token_hash=opaque-token&type=invite"),
    async () => ({
      auth: {
        async verifyOtp(input: unknown) {
          calls.push(input);
          return { data: { session: { access_token: "opaque" } }, error: null };
        },
      },
    }),
  );
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "http://localhost/auth/confirm/password");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.deepEqual(calls, [{ token_hash: "opaque-token", type: "invite" }]);
});

test("confirmInvitation sends invalid or expired invites back without leaking Auth errors", async () => {
  const response = await confirmInvitation(
    new Request("http://localhost/auth/confirm?token_hash=opaque-token&type=invite"),
    async () => ({
      auth: {
        async verifyOtp() {
          return { data: null, error: { message: "private token details" } };
        },
      },
    }),
  );
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "http://localhost/login?error=invite_invalid");
});

test("confirmInvitation fails closed when the server Auth client cannot be created", async () => {
  const response = await confirmInvitation(
    new Request("http://localhost/auth/confirm?token_hash=opaque-token&type=invite"),
    async () => { throw new Error("private configuration details"); },
  );
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "http://localhost/login?error=invite_invalid");
});
