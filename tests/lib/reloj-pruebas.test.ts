import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolverFechaOperativa } from "@/lib/fecha";
import { relojPruebasHabilitado } from "@/lib/reloj-pruebas";

describe("reloj de pruebas", () => {
  test("resuelve una fecha operativa explícita sin depender del reloj real", () => {
    assert.deepEqual(resolverFechaOperativa("2026-04-15"), {
      anio: 2026,
      mes: 4,
      dia: 15,
    });
  });

  test("rechaza fechas calendarias imposibles", () => {
    assert.throws(() => resolverFechaOperativa("2026-02-31"), /fuera de rango/i);
  });

  test("solo se habilita en local o preview, nunca en producción real", () => {
    assert.equal(relojPruebasHabilitado({ NODE_ENV: "development" }), true);
    assert.equal(
      relojPruebasHabilitado({ NODE_ENV: "production", VERCEL_ENV: "preview" }),
      true,
    );
    assert.equal(
      relojPruebasHabilitado({ NODE_ENV: "production", VERCEL_ENV: "production" }),
      false,
    );
  });
});
