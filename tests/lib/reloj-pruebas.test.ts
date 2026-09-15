import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  createClock,
  createSystemClock,
  createTestClock,
  type TestClockStore,
} from "@/lib/clock";
import { relojPruebasHabilitado } from "@/lib/reloj-pruebas";

describe("Clock", () => {
  test("SystemClock devuelve la fecha real provista por su fuente", async () => {
    const real = new Date("2026-09-15T18:00:00.000Z");
    const clock = createSystemClock(() => real);

    assert.equal((await clock.now()).toISOString(), real.toISOString());
    assert.deepEqual(await clock.today(), { anio: 2026, mes: 9, dia: 15 });
  });

  test("TestClock usa una fecha global persistida", async () => {
    let value: string | null = "2026-04-15";
    const store: TestClockStore = {
      get: async () => value,
      set: async (fecha) => { value = fecha; },
      clear: async () => { value = null; },
    };
    const clock = createTestClock(store);

    assert.deepEqual(await clock.today(), { anio: 2026, mes: 4, dia: 15 });
    assert.equal((await clock.now()).toISOString(), "2026-04-15T15:00:00.000Z");

    await clock.setDate("2026-07-20");
    assert.deepEqual(await clock.today(), { anio: 2026, mes: 7, dia: 20 });
  });

  test("TestClock vuelve al reloj real cuando no hay fecha simulada", async () => {
    const store: TestClockStore = {
      get: async () => null,
      set: async () => undefined,
      clear: async () => undefined,
    };
    const real = new Date("2026-09-15T18:00:00.000Z");
    const clock = createTestClock(store, () => real);

    assert.equal((await clock.now()).toISOString(), real.toISOString());
    assert.deepEqual(await clock.today(), { anio: 2026, mes: 9, dia: 15 });
  });

  test("TestClock rechaza fechas imposibles", async () => {
    const store: TestClockStore = {
      get: async () => null,
      set: async () => undefined,
      clear: async () => undefined,
    };
    const clock = createTestClock(store);
    await assert.rejects(() => clock.setDate("2026-02-31"), /fuera de rango/i);
  });

  test("createClock selecciona TestClock en preview y SystemClock en producción", async () => {
    const store: TestClockStore = {
      get: async () => "2026-04-15",
      set: async () => undefined,
      clear: async () => undefined,
    };

    const preview = createClock({ NODE_ENV: "production", VERCEL_ENV: "preview" }, store);
    assert.deepEqual(await preview.today(), { anio: 2026, mes: 4, dia: 15 });

    const production = createClock(
      { NODE_ENV: "production", VERCEL_ENV: "production" },
      store,
      () => new Date("2026-09-15T18:00:00.000Z"),
    );
    assert.deepEqual(await production.today(), { anio: 2026, mes: 9, dia: 15 });
  });

  test("solo se habilita el reloj editable en local o preview", () => {
    assert.equal(relojPruebasHabilitado({ NODE_ENV: "development" }), true);
    assert.equal(relojPruebasHabilitado({ NODE_ENV: "production", VERCEL_ENV: "preview" }), true);
    assert.equal(relojPruebasHabilitado({ NODE_ENV: "production", VERCEL_ENV: "production" }), false);
  });
});
