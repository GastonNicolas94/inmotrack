import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "@prisma/client/runtime/client";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import { parseDashboardFilters } from "@/lib/dashboard/filters";
import { createDashboardService } from "@/services/dashboard.service";

const now = new Date("2026-09-12T15:00:00.000Z");
const service = createDashboardService({ prisma, now: () => now });

async function fixture() {
  const owner = await prisma.propietario.create({
    data: { nombre: "Propietario", cbu: "0000000000000000000000" },
  });
  const own = await prisma.propiedad.create({
    data: { id_propietario: owner.id, direccion: "Avenida Propia 1", es_propia: true },
  });
  const third = await prisma.propiedad.create({
    data: { id_propietario: owner.id, direccion: "Avenida Terceros 2", es_propia: false },
  });
  const tenant = await prisma.inquilino.create({
    data: { nombre: "Inquilino", dni_cuit: "20123456789" },
  });
  const ownContract = await prisma.contrato.create({
    data: {
      id_propiedad: own.id, id_inquilino: tenant.id,
      fecha_inicio: new Date("2026-01-01"), fecha_fin: new Date("2026-09-20"),
      estado: "POR_VENCER", monto_base: 100000, pct_comision: 10,
    },
  });
  const thirdContract = await prisma.contrato.create({
    data: {
      id_propiedad: third.id, id_inquilino: tenant.id,
      fecha_inicio: new Date("2026-01-01"), fecha_fin: new Date("2027-09-20"),
      estado: "ACTIVO", monto_base: 200000, pct_comision: 10,
    },
  });
  await prisma.contrato.create({
    data: {
      id_propiedad: third.id, id_inquilino: tenant.id,
      fecha_inicio: new Date("2025-01-01"), fecha_fin: new Date("2025-06-30"),
      estado: "VENCIDO", monto_base: 180000, pct_comision: 10,
    },
  });
  await prisma.contrato.create({
    data: {
      id_propiedad: third.id, id_inquilino: tenant.id,
      fecha_inicio: new Date("2026-01-01"), fecha_fin: new Date("2027-12-31"),
      estado: "MOROSO", monto_base: 150000, pct_comision: 10,
    },
  });
  const period = await prisma.periodoPago.create({
    data: { id_contrato: ownContract.id, periodo: "2026-08", fecha_vencimiento: new Date("2026-08-10"), estado_ciclo: "ABIERTO" },
  });
  const cargo = await prisma.cargo.create({
    data: { id_periodo: period.id, id_contrato: ownContract.id, tipo: "ALQUILER", monto: new Decimal("100000") },
  });
  const txn = await prisma.transaccion.create({
    data: { tipo: "INGRESO_COBRO", caja_destino: "TERCEROS", monto: 40000, id_contrato: ownContract.id, fecha_transaccion: new Date("2026-09-05T12:00:00Z") },
  });
  await prisma.aplicacionPago.create({ data: { id_transaccion: txn.id, id_cargo: cargo.id, monto_aplicado: 40000 } });
  const reversal = await prisma.transaccion.create({
    data: { tipo: "CONTRA_ASIENTO", caja_destino: "TERCEROS", monto: -10000, id_contrato: ownContract.id, id_txn_origen: txn.id, fecha_transaccion: new Date("2026-09-06T12:00:00Z") },
  });
  await prisma.aplicacionPago.create({ data: { id_transaccion: reversal.id, id_cargo: cargo.id, monto_aplicado: -10000 } });
  const commission = await prisma.transaccion.create({
    data: { tipo: "INGRESO_COMISION", caja_destino: "OPERATIVA", monto: 2000, id_contrato: ownContract.id, fecha_transaccion: new Date("2026-09-07T12:00:00Z") },
  });
  await prisma.transaccion.create({
    data: { tipo: "INGRESO_PUNITORIO", caja_destino: "OPERATIVA", monto: 300, id_contrato: ownContract.id, fecha_transaccion: new Date("2026-09-08T12:00:00Z") },
  });
  await prisma.transaccion.create({
    data: { tipo: "INGRESO_ALQUILER_PROPIO", caja_destino: "OPERATIVA", monto: 1000, id_contrato: ownContract.id, fecha_transaccion: new Date("2026-09-09T12:00:00Z") },
  });
  await prisma.transaccion.create({
    data: { tipo: "INGRESO_CONFECCION_CONTRATO", caja_destino: "OPERATIVA", monto: 400, id_contrato: ownContract.id, fecha_transaccion: new Date("2026-09-10T12:00:00Z") },
  });
  await prisma.transaccion.create({
    data: { tipo: "EGRESO_OPERATIVO", caja_destino: "OPERATIVA", monto: -500, fecha_transaccion: new Date("2026-09-11T12:00:00Z") },
  });
  await prisma.transaccion.create({
    data: { tipo: "CONTRA_ASIENTO", caja_destino: "OPERATIVA", monto: -2000, id_contrato: ownContract.id, id_txn_origen: commission.id, fecha_transaccion: new Date("2026-09-12T12:00:00Z") },
  });
  await prisma.transaccion.create({
    data: { tipo: "EGRESO_TERCEROS", caja_destino: "TERCEROS", monto: -900, id_contrato: ownContract.id, fecha_transaccion: new Date("2026-09-12T13:00:00Z") },
  });
  await prisma.transaccion.create({
    data: { tipo: "EGRESO_LIQUIDACION", caja_destino: "TERCEROS", monto: -700, id_contrato: ownContract.id, fecha_transaccion: new Date("2026-09-12T14:00:00Z") },
  });
  await prisma.transaccion.create({
    data: { tipo: "EGRESO_ADELANTO", caja_destino: "TERCEROS", monto: -600, id_propietario: owner.id, fecha_transaccion: new Date("2026-09-12T15:00:00Z") },
  });
  await prisma.transaccion.create({
    data: { tipo: "INGRESO_COMISION", caja_destino: "OPERATIVA", monto: 999, fecha_transaccion: new Date("2026-09-12T16:00:00Z") },
  });
  await prisma.transaccion.create({
    data: { tipo: "INGRESO_CONFECCION_CONTRATO", caja_destino: "OPERATIVA", monto: 111, id_contrato: ownContract.id, fecha_transaccion: new Date("2026-04-01T03:00:00Z") },
  });
  await prisma.transaccion.create({
    data: { tipo: "INGRESO_COMISION", caja_destino: "OPERATIVA", monto: 222, id_contrato: ownContract.id, fecha_transaccion: new Date("2026-10-01T03:00:00Z") },
  });
  const ownExpense = await prisma.gasto.create({
    data: { id_propiedad: own.id, concepto: "Pintura", categoria_interno: "Mantenimiento", monto: 12000, tipo: "ARREGLO", cargo_a: "PROPIETARIO", creado_en: new Date("2026-09-02T12:00:00Z") },
  });
  const contractOnlyExpense = await prisma.gasto.create({
    data: { id_propiedad: own.id, id_contrato: ownContract.id, concepto: "Expensas contrato", monto: 8000, tipo: "EXPENSA", cargo_a: "PROPIETARIO", creado_en: new Date("2026-09-03T12:00:00Z") },
  });
  const agencyExpense = await prisma.gasto.create({
    data: { concepto: "Sueldos", categoria_interno: "Sueldos", monto: 30000, tipo: "OTRO", cargo_a: "INMOBILIARIA", creado_en: new Date("2026-09-04T12:00:00Z") },
  });
  const pending = await prisma.liquidacion.create({
    data: { id_propietario: owner.id, fecha_corrida: new Date("2026-09-02T12:00:00Z"), fecha_desde: new Date("2026-08-01"), fecha_hasta: new Date("2026-08-31"), monto_bruto: 50000, retenciones: 5000, monto_neto: 45000, estado: "PENDIENTE" },
  });
  const approved = await prisma.liquidacion.create({
    data: { id_propietario: owner.id, fecha_corrida: new Date("2026-09-03T12:00:00Z"), fecha_desde: new Date("2026-09-01"), fecha_hasta: new Date("2026-09-01"), monto_bruto: 70000, retenciones: 10000, monto_neto: 60000, estado: "APROBADA" },
  });
  await prisma.liquidacionItem.create({
    data: { id_liquidacion: pending.id, id_propiedad: own.id, monto_bruto: 25000, comision: 2500, gastos: 0, monto_neto: 22500 },
  });
  await prisma.liquidacionItem.create({
    data: { id_liquidacion: pending.id, id_propiedad: third.id, monto_bruto: 25000, comision: 2500, gastos: 0, monto_neto: 22500 },
  });
  await prisma.liquidacionItem.create({
    data: { id_liquidacion: approved.id, id_propiedad: own.id, monto_bruto: 40000, comision: 5000, gastos: 5000, monto_neto: 30000 },
  });
  await prisma.liquidacionItem.create({
    data: { id_liquidacion: approved.id, id_propiedad: third.id, monto_bruto: 30000, comision: 5000, gastos: 5000, monto_neto: 20000 },
  });
  return { owner, own, third, ownContract, thirdContract, cargo, ownExpense, contractOnlyExpense, agencyExpense, pending, approved };
}

describe("DashboardService", () => {
  beforeEach(async () => { await cleanDatabase(); });

  it("returns current operational KPIs and bounded alerts", async () => {
    const data = await fixture();
    const result = await service.getOperationalData(parseDashboardFilters({ periodo: "2026-01" }, now));
    assert.deepEqual(result.metrics, {
      contratosVigentes: 3,
      contratosPorVencer: 1,
      cuotasVencidas: 1,
      montoVencido: "70000.00",
      gastosPendientes: { cantidad: 3, monto: "50000.00" },
      liquidacionesPendientes: { cantidad: 2, monto: "105000.00" },
    });
    assert.equal(result.alerts.filter((alert) => alert.kind === "deuda-vencida").length, 1);
    assert.equal(result.alerts.find((alert) => alert.kind === "deuda-vencida")?.amount, "70000.00");
    assert.equal(data.ownExpense.id_propiedad, data.own.id);
    assert.equal(result.alerts[0]?.kind, "contrato-por-vencer");
    assert.equal(result.alerts.at(-1)?.kind, "liquidacion-pendiente");

    const financial = await service.getFinancialData(parseDashboardFilters({ periodo: "2026-09" }, now));
    assert.deepEqual(financial.metrics, {
      cobrado: "30000.00",
      ingresosInmobiliaria: "2699.00",
      gastosOperativosPagados: "500.00",
      resultadoOperativo: "2199.00",
      pendienteLiquidar: "105000.00",
      deudaVencida: "70000.00",
    });
    assert.deepEqual(financial.monthlyCashFlow, [
      { periodo: "2026-04", ingresos: "111.00", egresos: "0.00" },
      { periodo: "2026-05", ingresos: "0.00", egresos: "0.00" },
      { periodo: "2026-06", ingresos: "0.00", egresos: "0.00" },
      { periodo: "2026-07", ingresos: "0.00", egresos: "0.00" },
      { periodo: "2026-08", ingresos: "0.00", egresos: "0.00" },
      { periodo: "2026-09", ingresos: "2699.00", egresos: "500.00" },
    ]);
    assert.deepEqual(financial.expensesByCategory, [{ categoria: "OTRO", monto: "30000.00" }]);
  });

  it("applies explicit property and portfolio filters", async () => {
    const data = await fixture();
    const filters = parseDashboardFilters({ propiedad: String(data.own.id), cartera: "propias", periodo: "2026-09" }, now);
    const [operational, financial] = await Promise.all([
      service.getOperationalData(filters),
      service.getFinancialData(filters),
    ]);
    assert.equal(operational.metrics.contratosVigentes, 1);
    assert.equal(operational.metrics.gastosPendientes.monto, "20000.00");
    assert.equal(operational.metrics.liquidacionesPendientes.monto, "52500.00");
    assert.deepEqual(financial.collectionsByPortfolio, [{ cartera: "propias", monto: "30000.00" }]);
    assert.deepEqual(financial.collectionsByProperty, [{ propiedadId: data.own.id, direccion: data.own.direccion, monto: "30000.00" }]);
    assert.deepEqual(financial.metrics, {
      cobrado: "30000.00",
      ingresosInmobiliaria: "1700.00",
      gastosOperativosPagados: "0.00",
      resultadoOperativo: "1700.00",
      pendienteLiquidar: "52500.00",
      deudaVencida: "70000.00",
    });
    assert.equal(financial.unattributedExcluded, true);
  });

  it("filters the third-party portfolio without owner-level guesses", async () => {
    const data = await fixture();
    const filters = parseDashboardFilters({ cartera: "terceros", periodo: "2026-09" }, now);
    const [operational, financial] = await Promise.all([
      service.getOperationalData(filters),
      service.getFinancialData(filters),
    ]);
    assert.equal(operational.metrics.contratosVigentes, 2);
    assert.equal(operational.metrics.cuotasVencidas, 0);
    assert.equal(operational.metrics.liquidacionesPendientes.monto, "42500.00");
    assert.equal(financial.metrics.cobrado, "0.00");
    assert.equal(financial.metrics.pendienteLiquidar, "42500.00");
    assert.deepEqual(financial.collectionsByProperty, []);
    assert.equal(financial.unattributedExcluded, true);
    assert.equal(data.third.es_propia, false);
  });

  it("caps every alert category at five rows with stable urgency order", async () => {
    const data = await fixture();
    for (let index = 0; index < 6; index += 1) {
      await prisma.gasto.create({
        data: {
          id_propiedad: data.own.id,
          concepto: `Pendiente ${index}`,
          monto: 100 + index,
          tipo: "OTRO",
          cargo_a: "PROPIETARIO",
          creado_en: new Date(`2026-01-0${index + 1}T12:00:00Z`),
        },
      });
    }
    const result = await service.getOperationalData(parseDashboardFilters({ periodo: "2026-09" }, now));
    const expenses = result.alerts.filter((alert) => alert.kind === "gasto-pendiente");
    assert.equal(expenses.length, 5);
    assert.deepEqual(expenses.map((alert) => alert.title), [
      "Pendiente 0", "Pendiente 1", "Pendiente 2", "Pendiente 3", "Pendiente 4",
    ]);
    const liquidationAlerts = result.alerts.filter((alert) => alert.kind === "liquidacion-pendiente");
    assert.deepEqual(liquidationAlerts.map((alert) => alert.description), ["PENDIENTE", "APROBADA"]);
  });

  it("returns ordered property options and an empty dataset", async () => {
    await fixture();
    const properties = await service.listPropertyOptions();
    assert.deepEqual(properties.map((property) => property.direccion), ["Avenida Propia 1", "Avenida Terceros 2"]);
    await cleanDatabase();
    const result = await service.getFinancialData(parseDashboardFilters({ periodo: "2026-09" }, now));
    assert.equal(result.metrics.cobrado, "0.00");
    assert.equal(result.monthlyCashFlow.length, 6);
    assert.deepEqual(result.collectionsByPortfolio, []);
  });
});
