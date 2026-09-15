import { test } from "node:test";
import assert from "node:assert/strict";
import * as fecha from "@/lib/fecha";

test("expone un resolver de fecha operativa explícita para el reloj de pruebas", () => {
  assert.equal(typeof (fecha as Record<string, unknown>).resolverFechaOperativa, "function");
});

test("el reloj de pruebas solo se habilita en local o preview, nunca en producción real", async () => {
  const modulo = await import("@/lib/reloj-pruebas").catch(() => null);
  assert.ok(modulo, "falta implementar el módulo del reloj de pruebas");
  if (!modulo) return;

  assert.equal(modulo.relojPruebasHabilitado({ NODE_ENV: "development" }), true);
  assert.equal(modulo.relojPruebasHabilitado({ NODE_ENV: "production", VERCEL_ENV: "preview" }), true);
  assert.equal(modulo.relojPruebasHabilitado({ NODE_ENV: "production", VERCEL_ENV: "production" }), false);
});
