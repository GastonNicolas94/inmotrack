import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTestClockStore } from "@/lib/test-clock-store";

describe("test clock store", () => {
  test("preview lee la fecha usando el SDK oficial de Global Config", async () => {
    const reads: string[] = [];
    const store = createTestClockStore(
      {
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        GLOBAL_CONFIG: "https://global-config.vercel.com/ecfg_clock?token=read-token",
      },
      (async () => {
        throw new Error("la lectura no debe usar fetch manual");
      }) as typeof fetch,
      async (key) => {
        reads.push(key);
        return "2026-04-15";
      },
    );

    assert.equal(await store.get(), "2026-04-15");
    assert.deepEqual(reads, ["inmotrack_test_date"]);
  });

  test("preview actualiza la fecha mediante la API oficial de Global Config", async () => {
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
      async () => "2026-04-01",
    );

    await store.set("2026-04-15");

    assert.equal(requests.length, 1);
    assert.equal(
      requests[0]?.url,
      "https://api.vercel.com/v1/global-config/ecfg_clock/items?teamId=team_clock",
    );
    assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
      items: [{ operation: "upsert", key: "inmotrack_test_date", value: "2026-04-15" }],
    });
  });

  test("preview borra la fecha mediante la API oficial", async () => {
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
        return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
      }) as typeof fetch,
      async () => "2026-04-15",
    );

    await store.clear();

    assert.equal(requests.length, 1);
    assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
      items: [{ operation: "delete", key: "inmotrack_test_date" }],
    });
  });

  test("preview puede leer pero rechaza escrituras si falta token de escritura", async () => {
    const store = createTestClockStore(
      {
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        GLOBAL_CONFIG: "https://global-config.vercel.com/ecfg_clock?token=read-token",
      },
      fetch,
      async () => null,
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
