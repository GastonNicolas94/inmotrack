import test from "node:test";
import assert from "node:assert/strict";
import { readAppUrl, readSupabasePublicEnv, readSupabaseSecret } from "../../lib/supabase/env.ts";

const validEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-publishable-key",
  SUPABASE_SECRET_KEY: "local-secret-key",
};

test("readSupabasePublicEnv requires the public URL", () => {
  assert.throws(
    () => readSupabasePublicEnv({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: validEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY }),
    /NEXT_PUBLIC_SUPABASE_URL/
  );
});

test("readSupabasePublicEnv rejects a blank public URL", () => {
  assert.throws(
    () =>
      readSupabasePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "   ",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: validEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      }),
    /NEXT_PUBLIC_SUPABASE_URL/
  );
});

test("readSupabasePublicEnv requires the publishable key", () => {
  assert.throws(
    () => readSupabasePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: validEnv.NEXT_PUBLIC_SUPABASE_URL }),
    /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/
  );
});

test("readSupabasePublicEnv rejects a blank publishable key", () => {
  assert.throws(
    () =>
      readSupabasePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: validEnv.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "   ",
      }),
    /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/
  );
});

test("readSupabaseSecret requires the server secret", () => {
  assert.throws(() => readSupabaseSecret({}), /SUPABASE_SECRET_KEY/);
});

test("readSupabaseSecret rejects a blank server secret", () => {
  assert.throws(() => readSupabaseSecret({ SUPABASE_SECRET_KEY: "   " }), /SUPABASE_SECRET_KEY/);
});

test("readSupabasePublicEnv returns the complete public environment", () => {
  assert.deepEqual(readSupabasePublicEnv(validEnv), {
    url: "http://127.0.0.1:54321",
    publishableKey: "local-publishable-key",
  });
});

test("readSupabaseSecret returns the complete server secret", () => {
  assert.equal(readSupabaseSecret(validEnv), "local-secret-key");
});

test("readSupabasePublicEnv reads process.env by default", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `  ${validEnv.NEXT_PUBLIC_SUPABASE_URL}  `;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = `  ${validEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}  `;
  try {
    assert.deepEqual(readSupabasePublicEnv(), {
      url: validEnv.NEXT_PUBLIC_SUPABASE_URL,
      publishableKey: validEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
  } finally {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
  }
});

test("readSupabaseSecret reads process.env by default", () => {
  const originalSecret = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_SECRET_KEY = `  ${validEnv.SUPABASE_SECRET_KEY}  `;
  try {
    assert.equal(readSupabaseSecret(), validEnv.SUPABASE_SECRET_KEY);
  } finally {
    if (originalSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalSecret;
  }
});

test("readAppUrl accepts only an HTTP(S) origin and normalizes a trailing slash", () => {
  assert.equal(readAppUrl({ APP_URL: "https://app.example.com/" }), "https://app.example.com");
  assert.equal(readAppUrl({ APP_URL: "http://127.0.0.1:3000" }), "http://127.0.0.1:3000");
});

test("readAppUrl rejects missing, credentialed, and path-based values", () => {
  assert.throws(() => readAppUrl({}), /APP_URL/);
  for (const APP_URL of [
    "%%%",
    "ftp://app.example.com",
    "https://user:pass@app.example.com",
    "https://app.example.com/path",
    "https://app.example.com?next=/dashboard",
    "https://app.example.com#invite",
  ]) {
    assert.throws(() => readAppUrl({ APP_URL }), /APP_URL/);
  }
});
