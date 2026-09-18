import "server-only";

import { Decimal } from "@prisma/client/runtime/client";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getArgentinaMonthRange } from "@/lib/dashboard/filters";
import { traceServiceObject } from "@/lib/observability/tracing";
import {
  calculateSignedFinancials,
  groupByLabel,
} from "@/lib/dashboard/metrics";
import type {
  DashboardAlert,
  DashboardFilters,
  DashboardPropertyOption,
  FinancialDashboardData,
  OperationalDashboardData,
} from "@/lib/dashboard/types";

export type DashboardServiceDependencies = {
  prisma: PrismaClient;
  now: () => Date;
};

export type DashboardService = {
  getOperationalData(filters: DashboardFilters): Promise<OperationalDashboardData>;
  getFinancialData(filters: DashboardFilters): Promise<FinancialDashboardData>;
  listPropertyOptions(): Promise<DashboardPropertyOption[]>;
};

type DebtMetricRow = { cantidad: number | bigint; monto: Decimal | string | number };
type DebtAlertRow = {
  id: number;
  saldo: Decimal | string | number;
  fecha_vencimiento: Date;
  id_contrato: number;
  tenant_name: string;
  property_address: string;
};
type LiquidationMetric = { cantidad: number; monto: string };
type LiquidationAlertRow = {
  id: number;
  estado: string;
  monto_neto: Decimal | string | number;
  fecha_corrida: Date;
  propietario: { nombre: string };
};
type AdjustmentAlertRow = {
  id: number;
  periodo_efectivo: string;
  contrato: {
    id: number;
    inquilino: { nombre: string };
    propiedad: { direccion: string };
  };
};

const ACTIVE_CONTRACT_STATES = ["ACTIVO", "MOROSO", "POR_VENCER"] as const;
const PENDING_LIQUIDATION_STATES = ["PENDIENTE", "APROBADA"] as const;
const ALERT_LIMIT = 5;

function money(value: Decimal | string | number | null | undefined): string {
  return new Decimal(value ?? 0).toFixed(2);
}

function dateAtUtcMidnight(year: number, month: number, day: number): Date {
  const result = new Date(0);
  result.setUTCFullYear(year, month - 1, day);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

function argentinaDateParts(value: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

function addMonths(periodo: string, offset: number): string {
  const [yearText, monthText] = periodo.split("-");
  const absoluteMonth = Number(yearText) * 12 + Number(monthText) - 1 + offset;
  const year = Math.floor(absoluteMonth / 12);
  const month = absoluteMonth % 12 + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function propertyPredicate(filters: DashboardFilters): Prisma.PropiedadWhereInput {
  return {
    ...(filters.propiedadId === null ? {} : { id: filters.propiedadId }),
    ...(filters.cartera === "todas" ? {} : { es_propia: filters.cartera === "propias" }),
  };
}

function hasAttributionFilter(filters: DashboardFilters): boolean {
  return filters.propiedadId !== null || filters.cartera !== "todas";
}

function propertyRelation(filters: DashboardFilters): { propiedad: Prisma.PropiedadWhereInput } | undefined {
  return hasAttributionFilter(filters) ? { propiedad: propertyPredicate(filters) } : undefined;
}

function debtWhereSql(filters: DashboardFilters, today: Date): Prisma.Sql {
  const predicates: Prisma.Sql[] = [
    Prisma.sql`c.tipo = 'ALQUILER'`,
    Prisma.sql`pp.fecha_vencimiento < ${today}`,
  ];
  if (filters.propiedadId !== null) predicates.push(Prisma.sql`p.id = ${filters.propiedadId}`);
  if (filters.cartera !== "todas") {
    predicates.push(Prisma.sql`p.es_propia = ${filters.cartera === "propias"}`);
  }
  return Prisma.join(predicates, " AND ");
}

function debtCte(filters: DashboardFilters, today: Date): Prisma.Sql {
  return Prisma.sql`
    WITH balances AS (
      SELECT c.id,
             c.id_contrato,
             pp.fecha_vencimiento,
             i.nombre AS tenant_name,
             p.direccion AS property_address,
             c.monto - COALESCE(SUM(ap.monto_aplicado), 0) AS saldo
      FROM cargos c
      JOIN periodos_pago pp ON pp.id = c.id_periodo
      JOIN contratos ct ON ct.id = c.id_contrato
      JOIN inquilinos i ON i.id = ct.id_inquilino
      JOIN propiedades p ON p.id = ct.id_propiedad
      LEFT JOIN aplicaciones_pago ap ON ap.id_cargo = c.id
      WHERE ${debtWhereSql(filters, today)}
      GROUP BY c.id, c.id_contrato, pp.fecha_vencimiento, i.nombre, p.direccion, c.monto
      HAVING c.monto - COALESCE(SUM(ap.monto_aplicado), 0) > 0
    )`;
}

function liquidationWhereSql(filters: DashboardFilters): Prisma.Sql {
  const predicates: Prisma.Sql[] = [Prisma.sql`l.estado IN ('PENDIENTE', 'APROBADA')`];
  if (filters.propiedadId !== null) predicates.push(Prisma.sql`p.id = ${filters.propiedadId}`);
  if (filters.cartera !== "todas") {
    predicates.push(Prisma.sql`p.es_propia = ${filters.cartera === "propias"}`);
  }
  return Prisma.join(predicates, " AND ");
}

async function queryFilteredLiquidationMetric(
  client: PrismaClient,
  filters: DashboardFilters,
): Promise<LiquidationMetric> {
  const rows = await client.$queryRaw<Array<{ cantidad: number | bigint; monto: Decimal | string | number }>>(Prisma.sql`
    SELECT COUNT(DISTINCT l.id)::int AS cantidad,
           COALESCE(SUM(li.monto_neto), 0) AS monto
    FROM liquidaciones l
    JOIN liquidaciones_items li ON li.id_liquidacion = l.id
    JOIN propiedades p ON p.id = li.id_propiedad
    WHERE ${liquidationWhereSql(filters)}
  `);
  return { cantidad: Number(rows[0]?.cantidad ?? 0), monto: money(rows[0]?.monto) };
}

async function queryLiquidationMetric(
  client: PrismaClient,
  filters: DashboardFilters,
): Promise<LiquidationMetric> {
  if (hasAttributionFilter(filters)) return queryFilteredLiquidationMetric(client, filters);
  const result = await client.liquidacion.aggregate({
    where: { estado: { in: [...PENDING_LIQUIDATION_STATES] } },
    _count: { _all: true },
    _sum: { monto_neto: true },
  });
  return { cantidad: result._count._all, monto: money(result._sum.monto_neto) };
}

async function queryDebtMetric(
  client: PrismaClient,
  filters: DashboardFilters,
  today: Date,
): Promise<{ cantidad: number; monto: string }> {
  const rows = await client.$queryRaw<DebtMetricRow[]>(Prisma.sql`
    ${debtCte(filters, today)}
    SELECT COUNT(*)::int AS cantidad, COALESCE(SUM(saldo), 0) AS monto FROM balances
  `);
  const row = rows[0];
  return { cantidad: Number(row?.cantidad ?? 0), monto: money(row?.monto) };
}

async function queryDebtAlerts(
  client: PrismaClient,
  filters: DashboardFilters,
  today: Date,
): Promise<DebtAlertRow[]> {
  return client.$queryRaw<DebtAlertRow[]>(Prisma.sql`
    ${debtCte(filters, today)}
    SELECT id, saldo, fecha_vencimiento, id_contrato, tenant_name, property_address
    FROM balances
    ORDER BY fecha_vencimiento ASC, id ASC
    LIMIT ${ALERT_LIMIT}
  `);
}

function createAdjustmentAlerts(rows: AdjustmentAlertRow[]): DashboardAlert[] {
  return rows.map((row) => ({
    kind: "ajuste-pendiente" as const,
    id: row.id,
    title: `Actualización ${row.periodo_efectivo}`,
    description: `${row.contrato.inquilino.nombre} · ${row.contrato.propiedad.direccion}`,
    href: "/contratos",
    contractId: row.contrato.id,
    tenantName: row.contrato.inquilino.nombre,
    propertyAddress: row.contrato.propiedad.direccion,
  }));
}

function createContractAlerts(rows: Array<{
  id: number;
  fecha_fin: Date;
  inquilino: { nombre: string };
  propiedad: { direccion: string };
}>): DashboardAlert[] {
  return rows.map((row) => ({
    kind: "contrato-por-vencer" as const,
    id: row.id,
    title: row.inquilino.nombre,
    description: row.propiedad.direccion,
    href: `/contratos/${row.id}/movimientos`,
    contractId: row.id,
    tenantName: row.inquilino.nombre,
    propertyAddress: row.propiedad.direccion,
    dueDate: row.fecha_fin,
  }));
}

function createDebtAlerts(rows: DebtAlertRow[]): DashboardAlert[] {
  return rows.map((row) => ({
    kind: "deuda-vencida" as const,
    id: row.id,
    title: row.tenant_name,
    description: row.property_address,
    amount: money(row.saldo),
    href: `/contratos/${row.id_contrato}/movimientos`,
    contractId: row.id_contrato,
    tenantName: row.tenant_name,
    propertyAddress: row.property_address,
    dueDate: new Date(row.fecha_vencimiento),
  }));
}

function createExpenseAlerts(rows: Array<{
  id: number;
  concepto: string;
  monto: Decimal;
  creado_en: Date;
  propiedad: { direccion: string } | null;
  contrato: { propiedad: { direccion: string } } | null;
}>): DashboardAlert[] {
  return rows.map((row) => {
    const direccion = row.propiedad?.direccion ?? row.contrato?.propiedad.direccion;
    return {
      kind: "gasto-pendiente" as const,
      id: row.id,
      title: row.concepto,
      description: direccion,
      amount: money(row.monto),
      href: "/gastos",
      propertyAddress: direccion,
      dueDate: row.creado_en,
    };
  });
}

function createLiquidationAlerts(rows: Array<{
  id: number;
  estado: string;
  monto_neto: Decimal | string | number;
  fecha_corrida: Date;
  propietario: { nombre: string };
}>): DashboardAlert[] {
  return rows.map((row) => ({
    kind: "liquidacion-pendiente" as const,
    id: row.id,
    title: row.propietario.nombre,
    description: row.estado,
    amount: money(row.monto_neto),
    href: "/liquidaciones",
    dueDate: row.fecha_corrida,
  }));
}

async function queryLiquidationAlerts(
  client: PrismaClient,
  filters: DashboardFilters,
): Promise<LiquidationAlertRow[]> {
  if (hasAttributionFilter(filters)) {
    return client.$queryRaw<LiquidationAlertRow[]>(Prisma.sql`
      SELECT l.id, l.estado, SUM(li.monto_neto) AS monto_neto,
             l.fecha_corrida, p0.nombre AS propietario_nombre
      FROM liquidaciones l
      JOIN liquidaciones_items li ON li.id_liquidacion = l.id
      JOIN propiedades p ON p.id = li.id_propiedad
      JOIN propietarios p0 ON p0.id = l.id_propietario
      WHERE ${liquidationWhereSql(filters)}
      GROUP BY l.id, l.estado, l.fecha_corrida, p0.nombre
      ORDER BY CASE WHEN l.estado = 'PENDIENTE' THEN 0 ELSE 1 END,
               l.fecha_corrida ASC, l.id ASC
      LIMIT ${ALERT_LIMIT}
    `).then((rows) => rows.map((row) => ({
      ...row,
      propietario: { nombre: (row as unknown as { propietario_nombre: string }).propietario_nombre },
    })));
  }
  const where: Prisma.LiquidacionWhereInput = { estado: { in: [...PENDING_LIQUIDATION_STATES] } };
  const [pending, approved] = await Promise.all(PENDING_LIQUIDATION_STATES.map((estado) =>
    client.liquidacion.findMany({
      where: { ...where, estado },
      select: { id: true, estado: true, monto_neto: true, fecha_corrida: true, propietario: { select: { nombre: true } } },
      orderBy: [{ fecha_corrida: "asc" }, { id: "asc" }],
      take: ALERT_LIMIT,
    }),
  ));
  return [...pending, ...approved].slice(0, ALERT_LIMIT);
}

async function getOperationalData(
  dependencies: DashboardServiceDependencies,
  filters: DashboardFilters,
): Promise<OperationalDashboardData> {
  const generatedAt = dependencies.now();
  const { year, month, day } = argentinaDateParts(generatedAt);
  const today = dateAtUtcMidnight(year, month, day);
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + 30);
  const property = propertyRelation(filters);
  const contractBaseWhere: Prisma.ContratoWhereInput = property ? { propiedad: property.propiedad } : {};
  const adjustmentWhere: Prisma.AjusteContratoWhereInput = {
    estado: "PENDIENTE",
    ...(property ? { contrato: { propiedad: property.propiedad } } : {}),
  };
  const gastoBaseWhere: Prisma.GastoWhereInput = property
    ? {
        OR: [
          { propiedad: property.propiedad },
          { id_propiedad: null, contrato: { propiedad: property.propiedad } },
        ],
      }
    : {};

  const [vigentes, porVencer, debt, pendingExpenseAggregate, pendingExpenseCount,
    pendingLiquidation, pendingAdjustmentCount, adjustmentAlerts, contractAlerts,
    debtAlerts, expenseAlerts, liquidationAlerts] = await Promise.all([
    dependencies.prisma.contrato.count({
      where: { ...contractBaseWhere, estado: { in: [...ACTIVE_CONTRACT_STATES] } },
    }),
    dependencies.prisma.contrato.count({
      where: {
        ...contractBaseWhere,
        estado: { in: [...ACTIVE_CONTRACT_STATES] },
        fecha_fin: { gte: today, lte: end },
      },
    }),
    queryDebtMetric(dependencies.prisma, filters, today),
    dependencies.prisma.gasto.aggregate({
      where: { ...gastoBaseWhere, estado_pago: "PENDIENTE", cargo_a: { in: ["PROPIETARIO", "INMOBILIARIA"] } },
      _sum: { monto: true },
    }),
    dependencies.prisma.gasto.count({
      where: { ...gastoBaseWhere, estado_pago: "PENDIENTE", cargo_a: { in: ["PROPIETARIO", "INMOBILIARIA"] } },
    }),
    queryLiquidationMetric(dependencies.prisma, filters),
    dependencies.prisma.ajusteContrato.count({ where: adjustmentWhere }),
    dependencies.prisma.ajusteContrato.findMany({
      where: adjustmentWhere,
      select: {
        id: true,
        periodo_efectivo: true,
        contrato: {
          select: {
            id: true,
            inquilino: { select: { nombre: true } },
            propiedad: { select: { direccion: true } },
          },
        },
      },
      orderBy: [{ periodo_efectivo: "asc" }, { id: "asc" }],
      take: ALERT_LIMIT,
    }),
    dependencies.prisma.contrato.findMany({
      where: {
        ...contractBaseWhere,
        estado: { in: [...ACTIVE_CONTRACT_STATES] },
        fecha_fin: { gte: today, lte: end },
      },
      select: {
        id: true,
        fecha_fin: true,
        inquilino: { select: { nombre: true } },
        propiedad: { select: { direccion: true } },
      },
      orderBy: [{ fecha_fin: "asc" }, { id: "asc" }],
      take: ALERT_LIMIT,
    }),
    queryDebtAlerts(dependencies.prisma, filters, today),
    dependencies.prisma.gasto.findMany({
      where: { ...gastoBaseWhere, estado_pago: "PENDIENTE", cargo_a: { in: ["PROPIETARIO", "INMOBILIARIA"] } },
      select: {
        id: true,
        concepto: true,
        monto: true,
        creado_en: true,
        propiedad: { select: { direccion: true } },
        contrato: { select: { propiedad: { select: { direccion: true } } } },
      },
      orderBy: [{ creado_en: "asc" }, { id: "asc" }],
      take: ALERT_LIMIT,
    }),
    queryLiquidationAlerts(dependencies.prisma, filters),
  ]);

  return {
    generatedAt,
    ajustesPendientes: pendingAdjustmentCount,
    metrics: {
      contratosVigentes: vigentes,
      contratosPorVencer: porVencer,
      cuotasVencidas: debt.cantidad,
      montoVencido: debt.monto,
      gastosPendientes: { cantidad: pendingExpenseCount, monto: money(pendingExpenseAggregate._sum.monto) },
      liquidacionesPendientes: { cantidad: pendingLiquidation.cantidad, monto: pendingLiquidation.monto },
    },
    alerts: [
      ...createAdjustmentAlerts(adjustmentAlerts),
      ...createContractAlerts(contractAlerts),
      ...createDebtAlerts(debtAlerts),
      ...createExpenseAlerts(expenseAlerts),
      ...createLiquidationAlerts(liquidationAlerts),
    ],
  };
}

async function getFinancialData(
  dependencies: DashboardServiceDependencies,
  filters: DashboardFilters,
): Promise<FinancialDashboardData> {
  const generatedAt = dependencies.now();
  const chartPeriods = Array.from({ length: 6 }, (_, index) => addMonths(filters.periodo, index - 5));
  const chartStart = getArgentinaMonthRange(chartPeriods[0]).inicio;
  const property = propertyRelation(filters);
  const transactionWhere: Prisma.TransaccionWhereInput = {
    fecha_transaccion: { gte: chartStart, lt: filters.periodoFinExclusivo },
    ...(property ? { contrato: { propiedad: property.propiedad } } : {}),
  };
  const gastoWhere: Prisma.GastoWhereInput = {
    creado_en: { gte: filters.periodoInicio, lt: filters.periodoFinExclusivo },
    cargo_a: "INMOBILIARIA",
    ...(property
      ? {
          OR: [
            { propiedad: property.propiedad },
            { id_propiedad: null, contrato: { propiedad: property.propiedad } },
          ],
        }
      : {}),
  };

  const [transactions, expenses, pendingLiquidation, debt] = await Promise.all([
    dependencies.prisma.transaccion.findMany({
      where: transactionWhere,
      select: {
        id: true,
        tipo: true,
        caja_destino: true,
        monto: true,
        fecha_transaccion: true,
        contrato: { select: { propiedad: { select: { id: true, direccion: true, es_propia: true } } } },
        txn_origen: { select: { tipo: true } },
      },
      orderBy: [{ fecha_transaccion: "asc" }, { id: "asc" }],
    }),
    dependencies.prisma.gasto.findMany({
      where: gastoWhere,
      select: { tipo: true, monto: true },
      orderBy: [{ tipo: "asc" }, { id: "asc" }],
    }),
    queryLiquidationMetric(dependencies.prisma, filters),
    queryDebtMetric(dependencies.prisma, filters, (() => {
      const { year, month, day } = argentinaDateParts(generatedAt);
      return dateAtUtcMidnight(year, month, day);
    })()),
  ]);

  const selectedTransactions = transactions.filter(
    (row) => row.fecha_transaccion >= filters.periodoInicio && row.fecha_transaccion < filters.periodoFinExclusivo,
  );
  const metricRows = selectedTransactions.map((row) => ({
    tipo: row.tipo,
    caja: row.caja_destino,
    monto: money(row.monto),
    originType: row.txn_origen?.tipo ?? null,
  }));
  const totals = calculateSignedFinancials(metricRows);
  const signedExpenses = new Decimal(totals.gastosOperativos);

  const monthlyCashFlow = chartPeriods.map((periodo) => {
    const range = getArgentinaMonthRange(periodo);
    const rows = transactions
      .filter((row) => row.fecha_transaccion >= range.inicio && row.fecha_transaccion < range.finExclusivo)
      .map((row) => ({ tipo: row.tipo, caja: row.caja_destino, monto: money(row.monto), originType: row.txn_origen?.tipo ?? null }));
    const flow = calculateSignedFinancials(rows);
    return {
      periodo,
      ingresos: flow.ingresosInmobiliaria,
      egresos: new Decimal(flow.gastosOperativos).negated().toFixed(2),
    };
  });

  const collectionRows = selectedTransactions.filter((row) => {
    const type = row.tipo === "CONTRA_ASIENTO" ? row.txn_origen?.tipo ?? row.tipo : row.tipo;
    return type === "INGRESO_COBRO" && row.caja_destino === "TERCEROS" && row.contrato?.propiedad;
  });
  const byPortfolio = groupByLabel(collectionRows.map((row) => ({
    label: row.contrato!.propiedad.es_propia ? "propias" : "terceros",
    value: money(row.monto),
  })));
  const collectionsByPortfolio = byPortfolio
    .map((row) => ({ cartera: row.label as "propias" | "terceros", monto: row.value }))
    .sort((a, b) => (a.cartera === "propias" ? 0 : 1) - (b.cartera === "propias" ? 0 : 1));
  const byProperty = new Map<number, { direccion: string; monto: Decimal }>();
  for (const row of collectionRows) {
    const propertyRow = row.contrato!.propiedad;
    const current = byProperty.get(propertyRow.id) ?? { direccion: propertyRow.direccion, monto: new Decimal(0) };
    current.monto = current.monto.plus(new Decimal(row.monto));
    byProperty.set(propertyRow.id, current);
  }
  const collectionsByProperty = [...byProperty]
    .map(([propiedadId, row]) => ({ propiedadId, direccion: row.direccion, monto: row.monto.toFixed(2) }))
    .sort((a, b) => new Decimal(b.monto).comparedTo(new Decimal(a.monto)) || a.propiedadId - b.propiedadId);

  const expensesByCategory = groupByLabel(expenses.map((row) => ({ label: row.tipo, value: money(row.monto) })))
    .map((row) => ({ categoria: row.label, monto: row.value }));

  return {
    generatedAt,
    periodo: filters.periodo,
    metrics: {
      cobrado: totals.cobrado,
      ingresosInmobiliaria: totals.ingresosInmobiliaria,
      gastosOperativosPagados: signedExpenses.negated().toFixed(2),
      resultadoOperativo: totals.resultadoOperativo,
      pendienteLiquidar: pendingLiquidation.monto,
      deudaVencida: debt.monto,
    },
    monthlyCashFlow,
    collectionsByPortfolio,
    collectionsByProperty,
    expensesByCategory,
    unattributedExcluded: hasAttributionFilter(filters),
  };
}

export function createDashboardService(
  dependencies: DashboardServiceDependencies,
): DashboardService {
  return {
    getOperationalData: (filters) => getOperationalData(dependencies, filters),
    getFinancialData: (filters) => getFinancialData(dependencies, filters),
    async listPropertyOptions() {
      const properties = await dependencies.prisma.propiedad.findMany({
        select: { id: true, direccion: true, es_propia: true },
        orderBy: [{ direccion: "asc" }, { id: "asc" }],
      });
      return properties.map((property) => ({
        id: property.id,
        direccion: property.direccion,
        esPropia: property.es_propia,
      }));
    },
  };
}

export const DashboardService = traceServiceObject("DashboardService", createDashboardService({ prisma, now: () => new Date() }));
