import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "@prisma/client/runtime/client";
import { calcularEstadoCobranza, estadoLiquidacionCargo } from "@/lib/estado-cobranza";

describe("calcularEstadoCobranza", () => {
  test("sin nada cobrado y no vencido → PENDIENTE", () => {
    const r = calcularEstadoCobranza({
      montoTotal: new Decimal(600000),
      montoPendiente: new Decimal(600000),
      vencido: false,
    });
    assert.equal(r, "PENDIENTE");
  });

  test("cobrado parcialmente y no vencido → PARCIAL", () => {
    const r = calcularEstadoCobranza({
      montoTotal: new Decimal(600000),
      montoPendiente: new Decimal(200000),
      vencido: false,
    });
    assert.equal(r, "PARCIAL");
  });

  test("cobrado totalmente → TOTAL, incluso si ya venció", () => {
    const r = calcularEstadoCobranza({
      montoTotal: new Decimal(600000),
      montoPendiente: new Decimal(0),
      vencido: true,
    });
    assert.equal(r, "TOTAL");
  });

  test("con deuda pendiente y vencido → VENCIDO, sea parcial o total lo que falta", () => {
    const total = calcularEstadoCobranza({
      montoTotal: new Decimal(600000),
      montoPendiente: new Decimal(600000),
      vencido: true,
    });
    assert.equal(total, "VENCIDO");

    const parcial = calcularEstadoCobranza({
      montoTotal: new Decimal(600000),
      montoPendiente: new Decimal(100000),
      vencido: true,
    });
    assert.equal(parcial, "VENCIDO");
  });
});

describe("estadoLiquidacionCargo", () => {
  test("sin aplicaciones → SIN_COBRAR", () => {
    const r = estadoLiquidacionCargo({
      aplicaciones: [],
    });
    assert.equal(r, "SIN_COBRAR");
  });

  test("una o más aplicaciones, ninguna liquidada → COBRADO_SIN_LIQUIDAR", () => {
    const r = estadoLiquidacionCargo({
      aplicaciones: [
        { id_liquidacion_item: null },
        { id_liquidacion_item: null },
      ],
    });
    assert.equal(r, "COBRADO_SIN_LIQUIDAR");
  });

  test("una o más aplicaciones, todas liquidadas → LIQUIDADO", () => {
    const r = estadoLiquidacionCargo({
      aplicaciones: [
        { id_liquidacion_item: 5 },
        { id_liquidacion_item: 7 },
      ],
    });
    assert.equal(r, "LIQUIDADO");
  });

  test("mezcla de aplicaciones liquidadas y no liquidadas → PARCIAL", () => {
    const r = estadoLiquidacionCargo({
      aplicaciones: [
        { id_liquidacion_item: 3 },
        { id_liquidacion_item: null },
      ],
    });
    assert.equal(r, "PARCIAL");
  });
});
