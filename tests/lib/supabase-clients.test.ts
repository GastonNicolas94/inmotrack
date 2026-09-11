import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { CookieOptions } from "@supabase/ssr";
import { createBrowserSupabaseClient } from "../../lib/supabase/client.ts";
import {
  createServerSupabaseClient,
  createServerCookieAdapter,
} from "../../lib/supabase/server.ts";
import { createAdminSupabaseClient } from "../../lib/supabase/admin.ts";

const validEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-publishable-key",
  SUPABASE_SECRET_KEY: "local-secret-key",
};

const originalEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
};

before(() => {
  Object.assign(process.env, validEnv);
});

after(() => {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("createBrowserSupabaseClient uses the public Supabase environment", () => {
  const client = createBrowserSupabaseClient();

  assert.equal(client.supabaseUrl, validEnv.NEXT_PUBLIC_SUPABASE_URL);
  assert.equal(client.supabaseKey, validEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  assert.equal(client.auth.persistSession, true);
});

test("createAdminSupabaseClient uses the secret without session persistence or refresh", () => {
  const client = createAdminSupabaseClient();

  assert.equal(client.supabaseUrl, validEnv.NEXT_PUBLIC_SUPABASE_URL);
  assert.equal(client.supabaseKey, validEnv.SUPABASE_SECRET_KEY);
  assert.equal(client.auth.persistSession, false);
  assert.equal(client.auth.autoRefreshToken, false);
});

test("createServerSupabaseClient awaits cookies and uses the supplied cookie store", async () => {
  const cookieStore = {
    getAll() {
      return [{ name: "session", value: "token" }];
    },
    set(_name: string, _value: string, _options?: CookieOptions) {
      // The adapter behavior is tested below; this store only constructs the client.
      void _name;
      void _value;
      void _options;
    },
  };
  const client = await createServerSupabaseClient(cookieStore);

  assert.equal(client.supabaseUrl, validEnv.NEXT_PUBLIC_SUPABASE_URL);
  assert.equal(client.supabaseKey, validEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
});

test("createServerSupabaseClient reads Next cookies when no store is supplied", async () => {
  await assert.rejects(
    () => createServerSupabaseClient(),
    /cookies.*outside a request scope/
  );
});

test("createServerCookieAdapter reads cookies and forwards cookie writes", () => {
  const writes: Array<[string, string, CookieOptions | undefined]> = [];
  const cookieStore = {
    getAll() {
      return [{ name: "session", value: "token" }];
    },
    set(name: string, value: string, options?: CookieOptions) {
      writes.push([name, value, options]);
    },
  };
  const adapter = createServerCookieAdapter(cookieStore);

  assert.deepEqual(adapter.getAll(), [{ name: "session", value: "token" }]);
  adapter.setAll(
    [{ name: "session", value: "next-token", options: { path: "/" } }],
    { "cache-control": "private, no-store" }
  );
  assert.deepEqual(writes, [["session", "next-token", { path: "/" }]]);
});

test("createServerCookieAdapter ignores writes that Server Components cannot persist", () => {
  const adapter = createServerCookieAdapter({
    getAll() {
      return [];
    },
    set() {
      throw new Error("cookies are read-only");
    },
  });

  assert.doesNotThrow(() =>
    adapter.setAll([{ name: "session", value: "token", options: {} }], {})
  );
});
