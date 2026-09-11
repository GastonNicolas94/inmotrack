import test from "node:test";
import assert from "node:assert/strict";
import {
  clearLocalAuthUsersIfSafe,
  createSeedAuthUser,
  upsertSeedProfile,
  seedDemoUsers,
  type SeedAuthAdmin,
} from "@/lib/seed-auth";

const localEnv = { INMOTRACK_ALLOW_DESTRUCTIVE_TESTS: "1" };
const localUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

test("clearLocalAuthUsersIfSafe skips deletion unless the local guard passes", async () => {
  let listed = false;
  const admin = {
    async listUsers() { listed = true; return { data: { users: [] }, error: null }; },
    async deleteUser() { return { error: null }; },
  } as SeedAuthAdmin;

  assert.equal(await clearLocalAuthUsersIfSafe(admin, "postgresql://remote.example/postgres", "https://remote.example", localEnv), false);
  assert.equal(listed, false);
});

test("clearLocalAuthUsersIfSafe deletes all local Auth identities across pages", async () => {
  const deleted: string[] = [];
  let page = 0;
  const admin = {
    async listUsers() {
      page += 1;
      return {
        data: { users: page === 1 ? Array.from({ length: 1000 }, (_, i) => ({ id: `id-${i}` })) : [{ id: "last" }] },
        error: null,
      };
    },
    async deleteUser(id: string) { deleted.push(id); return { error: null }; },
  } as SeedAuthAdmin;

  assert.equal(await clearLocalAuthUsersIfSafe(admin, localUrl, "http://127.0.0.1:54321", localEnv), true);
  assert.equal(deleted.length, 1001);
  assert.equal(deleted.at(-1), "last");
});

test("clearLocalAuthUsersIfSafe propagates Auth API errors", async () => {
  const admin = {
    async listUsers() { return { data: { users: [] }, error: new Error("list failed") }; },
    async deleteUser() { return { error: null }; },
  } as SeedAuthAdmin;
  await assert.rejects(clearLocalAuthUsersIfSafe(admin, localUrl, "http://127.0.0.1:54321", localEnv), /list failed/);

  const deletingAdmin = {
    async listUsers() { return { data: { users: [{ id: "id" }] }, error: null }; },
    async deleteUser() { return { error: new Error("delete failed") }; },
  } as SeedAuthAdmin;
  await assert.rejects(clearLocalAuthUsersIfSafe(deletingAdmin, localUrl, "http://127.0.0.1:54321", localEnv), /delete failed/);

  let listed = false;
  const remoteAuth = {
    async listUsers() { listed = true; return { data: { users: [] }, error: null }; },
    async deleteUser() { return { error: null }; },
  } as SeedAuthAdmin;
  await assert.rejects(
    clearLocalAuthUsersIfSafe(remoteAuth, localUrl, "https://project.supabase.co", localEnv),
    /Supabase local/
  );
  assert.equal(listed, false);
});

test("createSeedAuthUser sends the configured password and confirms email", async () => {
  let options: unknown;
  const admin = {
    async createUser(value: unknown) {
      options = value;
      return { data: { user: { id: "auth-id" } }, error: null };
    },
  } as SeedAuthAdmin;
  assert.deepEqual(await createSeedAuthUser(admin, "demo@example.com", "configured"), { id: "auth-id" });
  assert.deepEqual(options, { email: "demo@example.com", password: "configured", email_confirm: true });
});

test("createSeedAuthUser propagates API errors and missing identities", async () => {
  const failed = { async createUser() { return { data: { user: null }, error: new Error("create failed") }; } } as SeedAuthAdmin;
  await assert.rejects(createSeedAuthUser(failed, "x", "pw"), /create failed/);
  const empty = { async createUser() { return { data: { user: null }, error: null }; } } as SeedAuthAdmin;
  await assert.rejects(createSeedAuthUser(empty, "x", "pw"), /identidad/);
});

test("upsertSeedProfile compensates Auth when Prisma profile creation fails", async () => {
  const deleted: string[] = [];
  const admin = { async deleteUser(id: string) { deleted.push(id); return { error: null }; } } as SeedAuthAdmin;
  const prisma = { usuario: { async upsert() { throw new Error("profile failed"); } } };
  await assert.rejects(upsertSeedProfile(admin, prisma, { email: "x", auth_user_id: "auth-id", rol: "ADMIN" }), /profile failed/);
  assert.deepEqual(deleted, ["auth-id"]);

  const cleanupFailed = { async deleteUser() { return { error: new Error("cleanup failed") }; } } as SeedAuthAdmin;
  await assert.rejects(
    upsertSeedProfile(cleanupFailed, prisma, { email: "x", auth_user_id: "auth-id", rol: "ADMIN" }),
    AggregateError
  );
});

test("seedDemoUsers validates password and local Auth URL before cleanup", async () => {
  const calls: string[] = [];
  const admin = {
    async listUsers() { calls.push("list"); return { data: { users: [] }, error: null }; },
    async deleteUser() { calls.push("delete"); return { error: null }; },
    async createUser() { calls.push("create"); return { data: { user: { id: "id" } }, error: null }; },
  } as SeedAuthAdmin;
  const prisma = { usuario: { async upsert() { calls.push("upsert"); return { id: 1 }; } } };
  await assert.rejects(
    seedDemoUsers(admin, prisma, {
      databaseUrl: localUrl,
      supabaseUrl: "https://remote.example",
      env: { ...localEnv, INMOTRACK_SEED_PASSWORD: "configured" },
    }),
    /Supabase local/
  );
  assert.deepEqual(calls, []);

  await assert.rejects(
    seedDemoUsers(admin, prisma, {
      databaseUrl: localUrl,
      supabaseUrl: "http://127.0.0.1:54321",
      env: { ...localEnv },
    }),
    /INMOTRACK_SEED_PASSWORD/
  );
  assert.deepEqual(calls, []);
});

test("seedDemoUsers creates four Auth identities in order and upserts profiles", async () => {
  const calls: string[] = [];
  const profiles: Array<Record<string, unknown>> = [];
  let sequence = 0;
  const admin = {
    async listUsers() { calls.push("list"); return { data: { users: [] }, error: null }; },
    async deleteUser() { calls.push("delete"); return { error: null }; },
    async createUser({ email, password, email_confirm }: { email: string; password: string; email_confirm: boolean }) {
      calls.push(`create:${email}:${password}:${email_confirm}`);
      sequence += 1;
      return { data: { user: { id: `id-${sequence}` } }, error: null };
    },
  } as SeedAuthAdmin;
  const prisma = {
    usuario: {
      async upsert({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) {
        profiles.push({ ...create, ...update });
        calls.push(`upsert:${String(create.email)}`);
        return { id: profiles.length };
      },
    },
  };
  const result = await seedDemoUsers(admin, prisma, {
    databaseUrl: localUrl,
    supabaseUrl: "http://127.0.0.1:54321",
    env: { ...localEnv, INMOTRACK_SEED_PASSWORD: "configured" },
  });
  assert.deepEqual(Object.keys(result), [
    "admin@inmotrack.com",
    "empleado1@inmotrack.com",
    "empleado2@inmotrack.com",
    "auditor@inmotrack.com",
  ]);
  assert.equal(profiles[1].puede_aprobar_liquidaciones, true);
  assert.deepEqual(calls.slice(0, 5), ["list", "create:admin@inmotrack.com:configured:true", "upsert:admin@inmotrack.com", "create:empleado1@inmotrack.com:configured:true", "upsert:empleado1@inmotrack.com"]);

  await seedDemoUsers(admin, prisma, {
    databaseUrl: localUrl,
    supabaseUrl: "http://127.0.0.1:54321",
    env: { ...localEnv, INMOTRACK_SEED_PASSWORD: "configured" },
  });
  assert.equal(profiles.length, 8);
  assert.equal(calls.filter((call) => call.startsWith("upsert:")).length, 8);
  assert.equal(profiles[4].auth_user_id, "id-5");
  assert.equal(profiles[4].rol, "ADMIN");
});

test("seedDemoUsers compensates a partial Auth seed failure", async () => {
  const deleted: string[] = [];
  let created = 0;
  const admin = {
    async listUsers() { return { data: { users: [] }, error: null }; },
    async deleteUser(id: string) { deleted.push(id); return { error: null }; },
    async createUser() {
      created += 1;
      return { data: { user: { id: `id-${created}` } }, error: null };
    },
  } as SeedAuthAdmin;
  const prisma = { usuario: { async upsert() { throw new Error("profile failed"); } } };
  await assert.rejects(seedDemoUsers(admin, prisma, {
    databaseUrl: localUrl,
    supabaseUrl: "http://127.0.0.1:54321",
    env: { ...localEnv, INMOTRACK_SEED_PASSWORD: "configured" },
  }), /profile failed/);
  assert.deepEqual(deleted, ["id-1"]);
});
