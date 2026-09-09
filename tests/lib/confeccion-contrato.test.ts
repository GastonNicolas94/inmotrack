import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mesesDuracionContrato, calcularMontoConfeccion } from "@/lib/confeccion-contrato";

describe("mesesDuracionContrato", () => {
  test("un contrato de exactamente 24 meses (agosto 2026 a julio 2028)", () => {
    assert.equal(mesesDuracionContrato("2026-08-01", "2028-07-31"), 24);
  });

  test("un contrato de 12 meses dentro del mismo año", () => {
    assert.equal(mesesDuracionContrato("2026-01-01", "2026-12-31"), 12);
  });

  test("un contrato de un solo mes", () => {
    assert.equal(mesesDuracionContrato("2026-08-01", "2026-08-31"), 1);
  });
});

describe("calcularMontoConfeccion", () => {
  test("UN_ALQUILER devuelve exactamente el monto_base, sin importar la duración", () => {
    const monto = calcularMontoConfeccion({
      estrategia: "UN_ALQUILER",
      monto_base: 380000,
      fecha_inicio: "2026-08-01",
      fecha_fin: "2028-07-31",
    });
    assert.equal(monto.toString(), "380000");
  });

  test("PORCENTAJE_5 es 5% de (monto_base × meses de duración)", () => {
    const monto = calcularMontoConfeccion({
      estrategia: "PORCENTAJE_5",
      monto_base: 380000,
      fecha_inicio: "2026-08-01",
      fecha_fin: "2028-07-31", // 24 meses
    });
    // 380000 * 24 * 0.05 = 456000
    assert.equal(monto.toString(), "456000");
  });

  test("PORCENTAJE_5 con un contrato de 12 meses", () => {
    const monto = calcularMontoConfeccion({
      estrategia: "PORCENTAJE_5",
      monto_base: 300000,
      fecha_inicio: "2026-01-01",
      fecha_fin: "2026-12-31",
    });
    // 300000 * 12 * 0.05 = 180000
    assert.equal(monto.toString(), "180000");
  });
});
