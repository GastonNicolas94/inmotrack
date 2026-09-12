import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packagePath = new URL("../../package.json", import.meta.url);

test("the production build generates Prisma Client before Next.js type-checks", async () => {
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
    scripts?: Record<string, string>;
  };

  assert.equal(packageJson.scripts?.build, "prisma generate && next build");
});
