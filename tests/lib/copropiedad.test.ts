import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "@prisma/client/runtime/client";
import {
  normalizarParticipaciones,
  prorratearMonto,
} from "@/lib/copropiedad";

describe("normalizarParticipaciones", () => {
  it("exige al menos un propietario", () => {
    assert.throws(
      () => normalizarParticipaciones([]),
      /al menos un propietario/,
    );
  });

  it("rechaza propietarios repetidos", () => {
    assert.throws(
      () =>
        normalizarParticipaciones([
          { id_propietario: 1, porcentaje: 50 },
          { id_propietario: 1, porcentaje: 50 },
        ]),
      /no puede repetirse/,
    );
  });

  it("exige que los porcentajes sumen exactamente 100", () => {
    assert.throws(
      () =>
        normalizarParticipaciones([
          { id_propietario: 1, porcentaje: 60 },
          { id_propietario: 2, porcentaje: 30 },
        ]),
      /sumar exactamente 100%/,
    );
  });

  it("rechaza porcentajes fuera de rango", () => {
    assert.throws(
      () =>
        normalizarParticipaciones([
          { id_propietario: 1, porcentaje: 0 },
          { id_propietario: 2, porcentaje: 100 },
        ]),
      /mayor a 0/,
    );
  });
});

describe("prorratearMonto", () => {
  it("distribuye un monto según 60/40", () => {
    const resultado = prorratearMonto(1_000_000, [
      { id_propietario: 1, porcentaje: 60 },
      { id_propietario: 2, porcentaje: 40 },
    ]);

    assert.equal(resultado[0].monto.toFixed(2), "600000.00");
    assert.equal(resultado[1].monto.toFixed(2), "400000.00");
  });

  it("conserva exactamente el total aun con tercios", () => {
    const resultado = prorratearMonto(100, [
      { id_propietario: 1, porcentaje: "33.33" },
      { id_propietario: 2, porcentaje: "33.33" },
      { id_propietario: 3, porcentaje: "33.34" },
    ]);

    assert.deepEqual(
      resultado.map((item) => item.monto.toFixed(2)),
      ["33.33", "33.33", "33.34"],
    );

    const total = resultado.reduce(
      (acumulado, item) => acumulado.plus(item.monto),
      new Decimal(0),
    );
    assert.equal(total.toFixed(2), "100.00");
  });

  it("resuelve empates de centavos por id de propietario", () => {
    const resultado = prorratearMonto("0.01", [
      { id_propietario: 20, porcentaje: 50 },
      { id_propietario: 10, porcentaje: 50 },
    ]);

    assert.deepEqual(
      resultado.map((item) => [item.id_propietario, item.monto.toFixed(2)]),
      [
        [10, "0.01"],
        [20, "0.00"],
      ],
    );
  });

  it("rechaza montos negativos", () => {
    assert.throws(
      () =>
        prorratearMonto(-1, [
          { id_propietario: 1, porcentaje: 100 },
        ]),
      /no puede ser negativo/,
    );
  });
});
