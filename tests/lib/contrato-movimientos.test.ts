import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { createContratosService } from "../../services/contratos.service";
import { createSystemClock } from "../../lib/clock";

function service() {
  const prisma = {
    contrato: { findUnique: async () => ({
      id: 25,
      periodos_pago: [{ periodo: "2026-09", cargos: [
        { creado_en: new Date("2026-09-01T12:00:00Z"), tipo: "ALQUILER", descripcion: null, monto: "1000.10" },
        { creado_en: new Date("2026-09-03T12:00:00Z"), tipo: "PUNITORIO", descripcion: null, monto: "50.20" },
      ] }],
    }) },
    transaccion: { findMany: async () => [
      { fecha_transaccion: new Date("2026-09-02T12:00:00Z"), tipo: "INGRESO_COBRO", comentario: null, monto: "400.10" },
      { fecha_transaccion: new Date("2026-09-04T12:00:00Z"), tipo: "CONTRA_ASIENTO", comentario: null, monto: "-100.10" },
    ] },
  } as unknown as PrismaClient;
  return createContratosService({ prisma, clock: createSystemClock(() => new Date("2026-10-08")) });
}

test("mantiene saldos cronológicos exactos con cobros y contra-asientos al invertir la presentación", async () => {
  const detalle = (await service().obtenerMovimientosContrato(25))!;
  assert.deepEqual(detalle.movimientos.map(m => m.saldo.toString()), ["1000.1", "600", "650.2", "750.3"]);
  assert.equal(detalle.saldoActual.toString(), "750.3");
  assert.deepEqual([...detalle.movimientos].reverse().map(m => m.saldo.toString()), ["750.3", "650.2", "600", "1000.1"]);
});

test("el filtro conserva el saldo histórico de cada fila y el saldo actual global", async () => {
  const detalle = (await service().obtenerMovimientosContrato(25, {
    desde: new Date("2026-09-02"), hasta: new Date("2026-09-03T23:59:59Z"),
  }))!;
  assert.deepEqual(detalle.movimientos.map(m => m.saldo.toString()), ["600", "650.2"]);
  assert.equal(detalle.saldoActual.toString(), "750.3");
  const vacio = (await service().obtenerMovimientosContrato(25, { desde: new Date("2026-10-01") }))!;
  assert.equal(vacio.movimientos.length, 0);
  assert.equal(vacio.saldoActual.toString(), "750.3");
});
