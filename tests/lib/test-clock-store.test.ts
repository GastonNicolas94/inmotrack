import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTestClockStore } from "@/lib/test-clock-store";

describe("test clock store", () => {
  test("preview sin Global Config degrada a fecha real para lecturas", async () => {
    const store = createTestClockStore(
      { NODE_ENV: "production", VERCEL_ENV: "preview" },
      (async () => { throw new Error("no debería llamar fetch"); }) as typeof fetch,
    );

    assert.equal(await store.get(), null);
    await assert.rejects(() => store.set("2026-04-15"), /sin configurar/i);
  });

  test("local mantiene una fecha simulada compartida en memoria", async () => {
    const store = createTestClockStore({ NODE_ENV: "development" });
    await store.set("2026-04-15");
    assert.equal(await store.get(), "2026-04-15");
    await store.clear();
    assert.equal(await store.get(), null);
  });
});
