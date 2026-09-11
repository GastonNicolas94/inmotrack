import test from "node:test";
import assert from "node:assert/strict";
import { bootstrapAdmin, main, readBootstrapConfig } from "../../scripts/bootstrap-admin.ts";

const validEnv = {
  NODE_ENV: "development",
  BOOTSTRAP_ADMIN_EMAIL: "owner@example.com",
  BOOTSTRAP_ADMIN_CONFIRM_ENV: "development",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321/",
  BOOTSTRAP_ADMIN_CONFIRM_SUPABASE_URL: "http://127.0.0.1:54321",
  APP_URL: "http://127.0.0.1:3000",
};

test("readBootstrapConfig requires an email and explicit environment confirmation", () => {
  assert.throws(() => readBootstrapConfig({}), /BOOTSTRAP_ADMIN_EMAIL/);
  assert.throws(
    () => readBootstrapConfig({ NODE_ENV: "development", BOOTSTRAP_ADMIN_EMAIL: "owner@example.com" }),
    /BOOTSTRAP_ADMIN_CONFIRM_ENV/
  );
  assert.throws(
    () => readBootstrapConfig({ ...validEnv, BOOTSTRAP_ADMIN_CONFIRM_ENV: "production" }),
    /no coincide/
  );
  assert.throws(
    () => readBootstrapConfig({ ...validEnv, BOOTSTRAP_ADMIN_CONFIRM_SUPABASE_URL: undefined }),
    /BOOTSTRAP_ADMIN_CONFIRM_SUPABASE_URL/,
  );
  assert.throws(
    () => readBootstrapConfig({ ...validEnv, NEXT_PUBLIC_SUPABASE_URL: undefined }),
    /NEXT_PUBLIC_SUPABASE_URL/,
  );
  assert.throws(
    () => readBootstrapConfig({ ...validEnv, NODE_ENV: "staging" }),
    /NODE_ENV/,
  );
  assert.throws(
    () => readBootstrapConfig({ ...validEnv, BOOTSTRAP_ADMIN_CONFIRM_SUPABASE_URL: "https://other.example" }),
    /destino.*coincide|Supabase.*coincide/i,
  );
  assert.throws(
    () => readBootstrapConfig({ ...validEnv, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54322" }),
    /destino.*coincide|Supabase.*coincide/i,
  );
  assert.equal(readBootstrapConfig(validEnv).appUrl, "http://127.0.0.1:3000");
  assert.throws(
    () => readBootstrapConfig({ ...validEnv, APP_URL: undefined }),
    /APP_URL/,
  );
  assert.throws(
    () => readBootstrapConfig({ ...validEnv, APP_URL: "https://app.example/auth/confirm" }),
    /APP_URL.*origen|ruta/i,
  );
});

test("readBootstrapConfig rejects demo password configuration in production", () => {
  assert.throws(
    () =>
      readBootstrapConfig({
        ...validEnv,
        NODE_ENV: "production",
        BOOTSTRAP_ADMIN_CONFIRM_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: "https://prod.example",
        BOOTSTRAP_ADMIN_CONFIRM_SUPABASE_URL: "https://prod.example",
        INMOTRACK_SEED_PASSWORD: "local-only",
      }),
    /password.*demo|INMOTRACK_SEED_PASSWORD/i
  );
  assert.throws(
    () =>
      readBootstrapConfig({
        ...validEnv,
        NODE_ENV: "production",
        BOOTSTRAP_ADMIN_CONFIRM_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: "https://prod.example",
        BOOTSTRAP_ADMIN_CONFIRM_SUPABASE_URL: "https://prod.example",
        BOOTSTRAP_ADMIN_PASSWORD: "local-only",
      }),
    /password.*demo|BOOTSTRAP_ADMIN_PASSWORD/i
  );
});

test("bootstrapAdmin invites and creates the ADMIN profile", async () => {
  const calls: string[] = [];
  const admin = {
    auth: {
      admin: {
        async inviteUserByEmail(email: string, options: { redirectTo: string }) {
          calls.push(`invite:${email}:${options.redirectTo}`);
          return { data: { user: { id: "auth-id" } }, error: null };
        },
        async deleteUser(id: string) {
          calls.push(`delete:${id}`);
          return { data: {}, error: null };
        },
      },
    },
  };
  const prisma = {
    usuario: {
      async create({ data }: { data: Record<string, unknown> }) {
        calls.push(`profile:${String(data.auth_user_id)}`);
        return data;
      },
    },
  };

  await bootstrapAdmin("owner@example.com", admin, prisma, validEnv.APP_URL);
  assert.deepEqual(calls, ["invite:owner@example.com:http://127.0.0.1:3000/auth/confirm", "profile:auth-id"]);
});

test("bootstrapAdmin deletes the invited identity when profile creation fails", async () => {
  const calls: string[] = [];
  const admin = {
    auth: {
      admin: {
        async inviteUserByEmail() {
          return { data: { user: { id: "auth-id" } }, error: null };
        },
        async deleteUser(id: string) {
          calls.push(`delete:${id}`);
          return { data: {}, error: null };
        },
      },
    },
  };
  const prisma = {
    usuario: {
      async create() {
        throw new Error("profile failed");
      },
    },
  };

  await assert.rejects(
    bootstrapAdmin("owner@example.com", admin, prisma, validEnv.APP_URL),
    /profile failed/
  );
  assert.deepEqual(calls, ["delete:auth-id"]);
});

test("bootstrapAdmin does not delete an identity when invitation fails", async () => {
  const calls: string[] = [];
  const admin = {
    auth: {
      admin: {
        async inviteUserByEmail() {
          return { data: { user: null }, error: new Error("invite failed") };
        },
        async deleteUser(id: string) {
          calls.push(`delete:${id}`);
          return { data: {}, error: null };
        },
      },
    },
  };
  const prisma = { usuario: { async create() { throw new Error("must not run"); } } };

  await assert.rejects(
    bootstrapAdmin("owner@example.com", admin, prisma, validEnv.APP_URL),
    /invite failed/
  );
  assert.deepEqual(calls, []);
});

test("bootstrapAdmin reports a missing Auth identity without creating a profile", async () => {
  let created = false;
  const admin = {
    auth: {
      admin: {
        async inviteUserByEmail() {
          return { data: { user: null }, error: null };
        },
        async deleteUser() { return { error: null }; },
      },
    },
  };
  const prisma = { usuario: { async create() { created = true; return {}; } } };
  await assert.rejects(bootstrapAdmin("owner@example.com", admin, prisma, validEnv.APP_URL), /usuario invitado/);
  assert.equal(created, false);
});

test("bootstrapAdmin surfaces a failed Auth compensation", async () => {
  const admin = {
    auth: {
      admin: {
        async inviteUserByEmail() {
          return { data: { user: { id: "auth-id" } }, error: null };
        },
        async deleteUser() { return { error: new Error("cleanup failed") }; },
      },
    },
  };
  const prisma = { usuario: { async create() { throw new Error("profile failed"); } } };
  await assert.rejects(
    bootstrapAdmin("owner@example.com", admin, prisma, validEnv.APP_URL),
    AggregateError
  );
});

test("main validates the environment and runs injected dependencies", async () => {
  const calls: string[] = [];
  const admin = {
    auth: {
      admin: {
        async inviteUserByEmail(_email: string, options: { redirectTo: string }) {
          calls.push(`invite:${options.redirectTo}`);
          return { data: { user: { id: "auth-id" } }, error: null };
        },
        async deleteUser() { return { error: null }; },
      },
    },
  };
  const prisma = { usuario: { async create() { calls.push("profile"); return {}; } } };
  await main(validEnv, {
    createAdmin: () => admin,
    getPrisma: () => prisma,
  });
  assert.deepEqual(calls, ["invite:http://127.0.0.1:3000/auth/confirm", "profile"]);
});
