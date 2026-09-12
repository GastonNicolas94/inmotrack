import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "@prisma/client/runtime/client";
import {
  buildBars,
  buildChartPoints,
  buildMonthlyCashFlow,
  calculatePendingAmount,
  calculateSignedFinancials,
  groupByLabel,
} from "@/lib/dashboard/metrics";

describe("dashboard metrics", () => {
  test("does not double-count a gross collection and its commission", () => {
    const totals = calculateSignedFinancials([
      { tipo: "INGRESO_COBRO", caja: "TERCEROS", monto: "100000.00", originType: null },
      { tipo: "INGRESO_COMISION", caja: "OPERATIVA", monto: "10000.00", originType: "INGRESO_COBRO" },
    ]);

    assert.deepEqual(totals, {
      cobrado: "100000.00",
      ingresosInmobiliaria: "10000.00",
      gastosOperativos: "0.00",
      resultadoOperativo: "10000.00",
    });
  });

  test("a contra-asiento reverses the original category", () => {
    const totals = calculateSignedFinancials([
      { tipo: "INGRESO_COMISION", caja: "OPERATIVA", monto: "10000.00", originType: null },
      { tipo: "CONTRA_ASIENTO", caja: "OPERATIVA", monto: "-10000.00", originType: "INGRESO_COMISION" },
    ]);

    assert.equal(totals.ingresosInmobiliaria, "0.00");
  });

  test("pending cargo balance includes negative applications", () => {
    assert.equal(calculatePendingAmount("100000.00", ["-20000.00", "50000.00"]), "70000.00");
  });

  test("accepts both scalar and object application adapters, including Decimal", () => {
    assert.equal(calculatePendingAmount("1.00", [{ monto_aplicado: "0.10" }]), "0.90");
    assert.equal(calculatePendingAmount("1.00", [new Decimal("0.10")]), "0.90");
  });

  test("classifies every financial category without mixing third-party flows", () => {
    const totals = calculateSignedFinancials([
      { tipo: "INGRESO_COBRO", caja: "TERCEROS", monto: "100.00", originType: null },
      { tipo: "INGRESO_PUNITORIO", caja: "OPERATIVA", monto: "2.50", originType: null },
      { tipo: "INGRESO_ALQUILER_PROPIO", caja: "OPERATIVA", monto: "40.00", originType: null },
      { tipo: "INGRESO_CONFECCION_CONTRATO", caja: "OPERATIVA", monto: "5.00", originType: null },
      { tipo: "EGRESO_OPERATIVO", caja: "OPERATIVA", monto: "-12.25", originType: null },
      { tipo: "EGRESO_LIQUIDACION", caja: "TERCEROS", monto: "-70.00", originType: null },
      { tipo: "EGRESO_TERCEROS", caja: "TERCEROS", monto: "-8.00", originType: null },
      { tipo: "EGRESO_ADELANTO", caja: "TERCEROS", monto: "-6.00", originType: null },
    ]);

    assert.deepEqual(totals, {
      cobrado: "100.00",
      ingresosInmobiliaria: "47.50",
      gastosOperativos: "-12.25",
      resultadoOperativo: "35.25",
    });
  });

  test("reverses contra-asientos for collections, operating expenses and third-party flows", () => {
    const totals = calculateSignedFinancials([
      { tipo: "INGRESO_COBRO", caja: "TERCEROS", monto: "100.00", originType: null },
      { tipo: "CONTRA_ASIENTO", caja: "TERCEROS", monto: "-100.00", originType: "INGRESO_COBRO" },
      { tipo: "EGRESO_OPERATIVO", caja: "OPERATIVA", monto: "-10.00", originType: null },
      { tipo: "CONTRA_ASIENTO", caja: "OPERATIVA", monto: "10.00", originType: "EGRESO_OPERATIVO" },
      { tipo: "EGRESO_LIQUIDACION", caja: "TERCEROS", monto: "-9.00", originType: null },
      { tipo: "CONTRA_ASIENTO", caja: "TERCEROS", monto: "9.00", originType: "EGRESO_LIQUIDACION" },
    ]);

    assert.deepEqual(totals, {
      cobrado: "0.00",
      ingresosInmobiliaria: "0.00",
      gastosOperativos: "0.00",
      resultadoOperativo: "0.00",
    });
  });

  test("ignores wrong cash boxes, unknown categories and contra-asientos without an origin", () => {
    const totals = calculateSignedFinancials([
      { tipo: "INGRESO_COBRO", caja: "OPERATIVA", monto: "100.00", originType: null },
      { tipo: "INGRESO_COMISION", caja: "TERCEROS", monto: "10.00", originType: null },
      { tipo: "EGRESO_OPERATIVO", caja: "TERCEROS", monto: "-20.00", originType: null },
      { tipo: "DESCONOCIDO", caja: "OPERATIVA", monto: "999.00", originType: null },
      { tipo: "CONTRA_ASIENTO", caja: "OPERATIVA", monto: "-9.00", originType: null },
    ]);
    assert.deepEqual(totals, {
      cobrado: "0.00",
      ingresosInmobiliaria: "0.00",
      gastosOperativos: "0.00",
      resultadoOperativo: "0.00",
    });
  });

  test("keeps decimal precision while grouping chart values", () => {
    const grouped = groupByLabel([
      { label: "A", value: "0.10" },
      { label: "A", value: "0.20" },
      { label: "B", value: "100000000000.99" },
    ]);
    assert.deepEqual(grouped, [
      { label: "A", value: "0.30" },
      { label: "B", value: "100000000000.99" },
    ]);
  });

  test("builds stable bars, clamps ratios and keeps zero values visible", () => {
    assert.deepEqual(buildBars([
      { label: "A", value: "0.00" },
      { label: "B", value: "50.00" },
      { label: "C", value: "100.00" },
      { label: "D", value: "150.00" },
    ]), [
      { label: "A", value: "0.00", ratio: 0.01 },
      { label: "B", value: "50.00", ratio: 1 / 3 },
      { label: "C", value: "100.00", ratio: 2 / 3 },
      { label: "D", value: "150.00", ratio: 1 },
    ]);
  });

  test("uses a minimum ratio for an all-zero bar series", () => {
    assert.deepEqual(buildBars([
      { label: "A", value: "0.00" },
      { label: "B", value: "0.00" },
    ]), [
      { label: "A", value: "0.00", ratio: 0.01 },
      { label: "B", value: "0.00", ratio: 0.01 },
    ]);
  });

  test("builds six-month chart points in input order", () => {
    assert.deepEqual(buildMonthlyCashFlow([
      { periodo: "2026-08", ingresos: "1.00", egresos: "-2.00" },
      { periodo: "2026-09", ingresos: "3.00", egresos: "4.00" },
    ]), [
      { label: "2026-08", valueA: "1.00", valueB: "-2.00" },
      { label: "2026-09", valueA: "3.00", valueB: "4.00" },
    ]);
  });

  test("generic chart-point alias matches monthly chart helper", () => {
    const rows = [{ periodo: "2026-09", ingresos: "1.00", egresos: "-1.00" }];
    assert.deepEqual(buildChartPoints(rows), buildMonthlyCashFlow(rows));
  });

  test("returns zero totals and empty chart models for empty input", () => {
    assert.deepEqual(calculateSignedFinancials([]), {
      cobrado: "0.00",
      ingresosInmobiliaria: "0.00",
      gastosOperativos: "0.00",
      resultadoOperativo: "0.00",
    });
    assert.deepEqual(buildBars([]), []);
    assert.deepEqual(buildMonthlyCashFlow([]), []);
    assert.deepEqual(groupByLabel([]), []);
  });
});
