import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTestClockStore } from "@/lib/test-clock-store";

const CONFIG_ID = "ecfg_dgdcbruhamcqzsjkbtpelw41vkvg";
const ITEM_KEY = "inmotrack_test_date";

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
    assert.deepEqual(reads, [ITEM_KEY]);
  });

  test("preview verifica el item con la API de administracion antes de escribir", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const store = createTestClockStore(
      {
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        GLOBAL_CONFIG: "https://global-config.vercel.com/ecfg_otro_store?token=read-token",
        VERCEL_TOKEN: "write-token",
        VERCEL_TEAM_ID: "team_clock",
      },
      (async (input, init) => {
        requests.push({ url: String(input), init });
        if (init?.method === "GET") {
          return new Response(JSON.stringify({ key: ITEM_KEY, value: "2026-04-01" }), { status: 200 });
        }
        return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
      }) as typeof fetch,
      async () => "2026-04-01",
    );

    await store.set("2026-04-15");

    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.init?.method, "GET");
    assert.equal(
      requests[0]?.url,
      `https://api.vercel.com/v1/global-config/${CONFIG_ID}/item/${ITEM_KEY}?teamId=team_clock`,
    );
    assert.equal(requests[1]?.init?.method, "PATCH");
    assert.equal(
      requests[1]?.url,
      `https://api.vercel.com/v1/global-config/${CONFIG_ID}/items?teamId=team_clock`,
    );
    assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
      items: [{ operation: "upsert", key: ITEM_KEY, value: "2026-04-15" }],
    });
  });

  test("preview corta antes del PATCH y expone el diagnostico si la API de administracion no ve el item", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const store = createTestClockStore(
      {
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        GLOBAL_CONFIG: "https://global-config.vercel.com/ecfg_otro_store?token=read-token",
        VERCEL_TOKEN: "write-token",
        VERCEL_TEAM_ID: "team_clock",
      },
      (async (input, init) => {
        requests.push({ url: String(input), init });
        return new Response(
          JSON.stringify({ error: { code: "not_found", message: "Edge Config Item not found." } }),
          { status: 404 },
        );
      }) as typeof fetch,
      async () => "2026-04-01",
    );

    await assert.rejects(
      () => store.set("2026-04-15"),
      /verificacion de item.*404.*Edge Config Item not found/i,
    );

    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.init?.method, "GET");
  });

  test("preview usa VERCEL_ORG_ID como teamId cuando VERCEL_TEAM_ID no esta disponible", async () => {
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
        if (init?.method === "GET") {
          return new Response(JSON.stringify({ key: ITEM_KEY, value: "2026-04-15" }), { status: 200 });
        }
        return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
      }) as typeof fetch,
      async () => "2026-04-15",
    );

    await store.clear();

    assert.equal(requests.length, 2);
    assert.equal(
      requests[0]?.url,
      `https://api.vercel.com/v1/global-config/${CONFIG_ID}/item/${ITEM_KEY}?teamId=team_runtime`,
    );
    assert.equal(
      requests[1]?.url,
      `https://api.vercel.com/v1/global-config/${CONFIG_ID}/items?teamId=team_runtime`,
    );
    assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
      items: [{ operation: "delete", key: ITEM_KEY }],
    });
  });

  test("preview usa el team de InmoTrack cuando Vercel no expone variables de scope", async () => {
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
        if (init?.method === "GET") {
          return new Response(JSON.stringify({ key: ITEM_KEY, value: "2026-04-01" }), { status: 200 });
        }
        return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
      }) as typeof fetch,
      async () => "2026-04-01",
    );

    await store.set("2026-04-15");

    assert.equal(requests.length, 2);
    assert.equal(
      requests[0]?.url,
      `https://api.vercel.com/v1/global-config/${CONFIG_ID}/item/${ITEM_KEY}?teamId=team_pSHI2gL7fkccZnt2ayzYTco7`,
    );
    assert.equal(
      requests[1]?.url,
      `https://api.vercel.com/v1/global-config/${CONFIG_ID}/items?teamId=team_pSHI2gL7fkccZnt2ayzYTco7`,
    );
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
