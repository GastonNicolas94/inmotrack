import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTestClockStore } from "@/lib/test-clock-store";

describe("test clock store", () => {
  test("preview lee la fecha desde GLOBAL_CONFIG adjunta al proyecto", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const store = createTestClockStore(
      {
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        GLOBAL_CONFIG: "https://global-config.vercel.com/ecfg_clock?token=read-token",
      },
      (async (input, init) => {
        requests.push({ url: String(input), init });
        return new Response(JSON.stringify("2026-04-15"), { status: 200 });
      }) as typeof fetch,
    );

    assert.equal(await store.get(), "2026-04-15");
    assert.equal(
      requests[0]?.url,
      "https://global-config.vercel.com/ecfg_clock/item/inmotrack_test_date?token=read-token",
    );
  });

  test("preview sobrescribe la fecha usando el id de GLOBAL_CONFIG", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const store = createTestClockStore(
      {
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        GLOBAL_CONFIG: "https://global-config.vercel.com/ecfg_clock?token=read-token",
        VERCEL_TOKEN: "write-token",
        VERCEL_TEAM_ID: "team_clock",
      },
      (async (input, init) => {
        requests.push({ url: String(input), init });
        return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
      }) as typeof fetch,
    );

    await store.set("2026-04-15");

    assert.equal(
      requests[0]?.url,
      "https://api.vercel.com/v1/global-config/ecfg_clock/items?teamId=team_clock",
    );
    assert.equal(requests[0]?.init?.method, "PATCH");
    assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
      items: [{ operation: "upsert", key: "inmotrack_test_date", value: "2026-04-15" }],
    });
  });

  test("preview puede leer pero rechaza escrituras si falta token de escritura", async () => {
    const store = createTestClockStore(
      {
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        GLOBAL_CONFIG: "https://global-config.vercel.com/ecfg_clock?token=read-token",
      },
      (async () => new Response(JSON.stringify(null), { status: 404 })) as typeof fetch,
    );

    assert.equal(await store.get(), null);
    await assert.rejects(() => store.set("2026-04-15"), /token de escritura/i);
  });

  test("local mantiene una fecha simulada compartida en memoria", async () => {
    const store = createTestClockStore({ NODE_ENV: "development" });
    await store.set("2026-04-15");
    assert.equal(await store.get(), "2026-04-15");
    await store.clear();
    assert.equal(await store.get(), null);
  });
});
