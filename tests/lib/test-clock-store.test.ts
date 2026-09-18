import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTestClockStore } from "@/lib/test-clock-store";

const CLOCK_PATH = "inmotrack/test-clock.json";

function blobBody(value: unknown) {
  return new Response(JSON.stringify(value)).body!;
}

describe("test clock store", () => {
  test("preview lee la fecha desde Vercel Blob privado sin cache", async () => {
    const calls: Array<{ pathname: string; options: unknown }> = [];
    const store = createTestClockStore(
      { NODE_ENV: "production", VERCEL_ENV: "preview" },
      {
        async get(pathname, options) {
          calls.push({ pathname, options });
          return {
            statusCode: 200,
            stream: blobBody({ fecha: "2026-04-15" }),
          };
        },
        async put() {
          throw new Error("no debe escribir");
        },
        async del() {
          throw new Error("no debe borrar");
        },
      },
    );

    assert.equal(await store.get(), "2026-04-15");
    assert.deepEqual(calls, [
      {
        pathname: CLOCK_PATH,
        options: { access: "private", useCache: false },
      },
    ]);
  });

  test("preview devuelve null cuando el Blob todavia no existe", async () => {
    const store = createTestClockStore(
      { NODE_ENV: "production", VERCEL_ENV: "preview" },
      {
        async get() {
          return null;
        },
        async put() {
          throw new Error("no debe escribir");
        },
        async del() {
          throw new Error("no debe borrar");
        },
      },
    );

    assert.equal(await store.get(), null);
  });

  test("preview sobrescribe la fecha en un Blob privado", async () => {
    const calls: Array<{ pathname: string; body: string; options: unknown }> = [];
    const store = createTestClockStore(
      { NODE_ENV: "production", VERCEL_ENV: "preview" },
      {
        async get() {
          return null;
        },
        async put(pathname, body, options) {
          calls.push({ pathname, body: String(body), options });
          return { url: "https://example.private.blob.vercel-storage.com/inmotrack/test-clock.json" };
        },
        async del() {
          throw new Error("no debe borrar");
        },
      },
    );

    await store.set("2026-04-15");

    assert.deepEqual(calls, [
      {
        pathname: CLOCK_PATH,
        body: JSON.stringify({ fecha: "2026-04-15" }),
        options: {
          access: "private",
          allowOverwrite: true,
          contentType: "application/json",
        },
      },
    ]);
  });

  test("preview borra el Blob al limpiar la fecha simulada", async () => {
    const deleted: string[] = [];
    const store = createTestClockStore(
      { NODE_ENV: "production", VERCEL_ENV: "preview" },
      {
        async get() {
          return null;
        },
        async put() {
          throw new Error("no debe escribir");
        },
        async del(pathname) {
          deleted.push(pathname);
        },
      },
    );

    await store.clear();
    assert.deepEqual(deleted, [CLOCK_PATH]);
  });

  test("local mantiene una fecha simulada compartida en memoria", async () => {
    const store = createTestClockStore({ NODE_ENV: "development" });
    await store.set("2026-04-15");
    assert.equal(await store.get(), "2026-04-15");
    await store.clear();
    assert.equal(await store.get(), null);
  });
});
