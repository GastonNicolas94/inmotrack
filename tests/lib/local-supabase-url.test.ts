import test from "node:test";
import assert from "node:assert/strict";
import { assertLocalSupabaseUrl, normalizeSupabaseUrl } from "@/lib/local-supabase-url";

test("normalizes the two supported Supabase CLI Auth URLs", () => {
  assert.equal(normalizeSupabaseUrl("http://127.0.0.1:54321/"), "http://127.0.0.1:54321");
  assert.equal(normalizeSupabaseUrl("http://LOCALHOST:54321"), "http://localhost:54321");
  assert.equal(normalizeSupabaseUrl("http://example.com"), "http://example.com:80");
  assert.equal(assertLocalSupabaseUrl("http://localhost:54321/"), "http://localhost:54321");
});

test("rejects remote, secure, credentialed, or decorated Auth URLs for destructive local work", () => {
  for (const value of [
    "https://127.0.0.1:54321",
    "http://127.0.0.1:54322",
    "http://127.0.0.1:54321/auth",
    "http://127.0.0.1:54321?project=local",
    "http://user:password@127.0.0.1:54321",
    "https://project.supabase.co",
    "not-a-url",
  ]) {
    assert.throws(() => assertLocalSupabaseUrl(value), /Supabase local|URL Supabase/);
  }
});

test("normalization accepts only a root URL without query, hash, or credentials", () => {
  assert.throws(() => normalizeSupabaseUrl("http://127.0.0.1:54321/#hash"), /URL Supabase/);
  assert.throws(() => normalizeSupabaseUrl("http://127.0.0.1:54321?x=1"), /URL Supabase/);
  assert.throws(() => normalizeSupabaseUrl("http://u:p@127.0.0.1:54321"), /URL Supabase/);
});
