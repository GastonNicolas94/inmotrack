import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const LEGACY_EXCEPTIONS = new Set([
  // Dashboard ya recibe `now` por factory; este único export legacy se mantiene
  // temporalmente por compatibilidad. La app usa DashboardClockService.
  "dashboard.service.ts",
]);

test("los services no leen tiempo ambiente fuera del Clock", async () => {
  const servicesDir = path.join(process.cwd(), "services");
  const files = (await readdir(servicesDir)).filter((name) => name.endsWith(".ts"));
  const violations: string[] = [];

  for (const file of files) {
    if (LEGACY_EXCEPTIONS.has(file)) continue;
    const source = await readFile(path.join(servicesDir, file), "utf8");
    if (/new\s+Date\s*\(\s*\)/.test(source)) violations.push(`${file}: new Date()`);
    if (/Date\.now\s*\(/.test(source)) violations.push(`${file}: Date.now()`);
    if (/hoyEnArgentina\s*\(/.test(source)) violations.push(`${file}: hoyEnArgentina()`);
  }

  assert.deepEqual(violations, []);
});
