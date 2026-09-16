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

  test("preview crea la fecha cuando la key todavía no existe", async () => {
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
        if (!init?.method) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
        return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
      }) as typeof fetch,
    );

    await store.set("2026-04-15");

    assert.equal(requests.length, 2);
    assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
      items: [{ operation: "create", key: "inmotrack_test_date", value: "2026-04-15" }],
    });
  });

  test("preview actualiza la fecha cuando la key ya existe", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const store = createTestClockStore(
      {
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        GLOBAL_CONFIG: "https://global-config.vercel.com/ecfg_clock?token=read-token",
        VERCEL_TOKEN: "write-token",
        VERCEL_ORG_ID: "team_runtime",
      },
      (async (input, init) => {
        requests.push({ url: String(input), init });
        if (!init?.method) return new Response(JSON.stringify("2026-04-01"), { status: 200 });
        return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
      }) as typeof fetch,
    );

    await store.set("2026-04-15");

    assert.equal(
      requests[1]?.url,
      "https://api.vercel.com/v1/global-config/ecfg_clock/items?teamId=team_runtime",
    );
    assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
      items: [{ operation: "update", key: "inmotrack_test_date", value: "2026-04-15" }],
    });
  });

  test("preview ignora clear cuando la key no existe", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const store = createTestClockStore(
      {
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        GLOBAL_CONFIG: "https://global-config.vercel.com/ecfg_clock?token=read-token",
        VERCEL_TOKEN: "write-token",
      },
      (async (input, init) => {
        requests.push({ url: String(input), init });
        return new Response(JSON.stringify(null), { status: 404 });
      }) as typeof fetch,
    );

    await store.clear();
    assert.equal(requests.length, 1);
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
