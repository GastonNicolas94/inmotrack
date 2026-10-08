import assert from "node:assert/strict";
import test from "node:test";
import { Decimal } from "@prisma/client/runtime/client";
import { separarSaldosContables } from "../../lib/dashboard/cajas";

test("saldos contables separados por caja, sin total artificial", () => {
  const result = separarSaldosContables([
    { caja_destino: "TERCEROS", _sum: { monto: new Decimal("150000.25") } },
    { caja_destino: "OPERATIVA", _sum: { monto: new Decimal("2600.30") } },
  ]);
  assert.deepEqual(result, { terceros: "150000.25", operativa: "2600.30" });
  assert.equal("total" in result, false);
});

test("caja ausente muestra saldo cero sin mezclarla", () => {
  const result = separarSaldosContables([
    { caja_destino: "TERCEROS", _sum: { monto: new Decimal("-25.25") } },
  ]);
  assert.deepEqual(result, { terceros: "-25.25", operativa: "0.00" });
});

test("sumas nulas representan cero", () => {
  assert.deepEqual(separarSaldosContables([
    { caja_destino: "OPERATIVA", _sum: { monto: null } },
  ]), { terceros: "0.00", operativa: "0.00" });
});
