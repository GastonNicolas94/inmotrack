import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL("../../.github/workflows/supabase-local.yml", import.meta.url);

test("the local Supabase CI gate exports the runtime Auth configuration", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.doesNotMatch(workflow, new RegExp(["NEXT", "AUTH_"].join("")));
  assert.match(workflow, /APP_URL: http:\/\/127\.0\.0\.1:3000/);
  assert.match(workflow, /supabase status -o env/);
  assert.match(workflow, /NEXT_PUBLIC_SUPABASE_URL=\$API_URL/);
  assert.match(workflow, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=\$PUBLISHABLE_KEY/);
  assert.match(workflow, /SUPABASE_SECRET_KEY=\$SECRET_KEY/);
});
