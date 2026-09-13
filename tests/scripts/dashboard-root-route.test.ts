import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootStarterPage = fileURLToPath(new URL("../../app/page.tsx", import.meta.url));
const dashboardRootPage = fileURLToPath(new URL("../../app/(dashboard)/page.tsx", import.meta.url));

test("the dashboard route group owns the application root route", () => {
  assert.equal(
    existsSync(rootStarterPage),
    false,
    "app/page.tsx shadows app/(dashboard)/page.tsx and makes Dashboard open the Next.js starter page",
  );
  assert.equal(existsSync(dashboardRootPage), true);
});
