import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const clientPath = new URL("../../lib/supabase/client.ts", import.meta.url);

test("the browser client exposes public Supabase variables to the Next.js bundle", async () => {
  const source = await readFile(clientPath, "utf8");

  assert.match(source, /process\.env\.NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(source, /process\.env\.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
});
