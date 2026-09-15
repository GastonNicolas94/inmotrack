import test from "node:test";
import assert from "node:assert/strict";

type CalcularDesglose = (liquidacion: {
  monto_bruto: string;
  retenciones: string;
  adelantos_descontados: string;
  monto_neto: string;
  items: Array<{ comision: string; gastos: string }>;
}) => {
  comisiones: { toFixed: (decimales: number) => string };
  gastos: { toFixed: (decimales: number) => string };
  deducciones: { toFixed: (decimales: number) => string };
  netoCalculado: { toFixed: (decimales: number) => string };
  consistente: boolean;
};

type CalcularPorcentajeComision = (
  montoBruto: string,
  comision: string
) => { toFixed: (decimales: number) => string };

async function cargarCalculo(): Promise<CalcularDesglose> {
  const modulo = await import("../../lib/liquidacion-detalle.ts").catch(() => null);
  assert.ok(modulo, "debe existir el cálculo decimal-safe del desglose");
  assert.equal(typeof modulo.calcularDesgloseLiquidacion, "function");
  return modulo.calcularDesgloseLiquidacion as CalcularDesglose;
}

test("desglosa comisión, gastos y adelantos sin perder precisión decimal", async () => {
  const calcularDesgloseLiquidacion = await cargarCalculo();
  const resultado = calcularDesgloseLiquidacion({
    monto_bruto: "100000.10",
    retenciones: "12500.03",
    adelantos_descontados: "5000.02",
    monto_neto: "82500.05",
    items: [
      { comision: "10000.01", gastos: "0" },
      { comision: "0", gastos: "2500.02" },
    ],
  });

  assert.equal(resultado.comisiones.toFixed(2), "10000.01");
  assert.equal(resultado.gastos.toFixed(2), "2500.02");
  assert.equal(resultado.deducciones.toFixed(2), "17500.05");
  assert.equal(resultado.netoCalculado.toFixed(2), "82500.05");
  assert.equal(resultado.consistente, true);
});

test("marca el detalle como inconsistente si las líneas no reconcilian con la cabecera", async () => {
  const calcularDesgloseLiquidacion = await cargarCalculo();
  const resultado = calcularDesgloseLiquidacion({
    monto_bruto: "100000.00",
    retenciones: "9000.00",
    adelantos_descontados: "0",
    monto_neto: "91000.00",
    items: [{ comision: "10000.00", gastos: "0" }],
  });

  assert.equal(resultado.netoCalculado.toFixed(2), "90000.00");
  assert.equal(resultado.consistente, false);
});

test("deriva el porcentaje histórico desde los importes sellados de la liquidación", async () => {
  const modulo = await import("../../lib/liquidacion-detalle.ts");
  const calcularPorcentajeComision =
    modulo.calcularPorcentajeComision as CalcularPorcentajeComision | undefined;

  assert.equal(typeof calcularPorcentajeComision, "function");
  assert.equal(calcularPorcentajeComision!("123456.78", "12345.68").toFixed(2), "10.00");
  assert.equal(calcularPorcentajeComision!("0", "0").toFixed(2), "0.00");
});
