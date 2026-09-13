import { Decimal } from "@prisma/client/runtime/client";
import { calcularPendiente } from "@/lib/saldos";
import type {
  ChartBar,
  ChartPoint,
  DashboardTransactionRow,
  FinancialTotals,
} from "@/lib/dashboard/types";

type Money = string | number | Decimal;
type GroupRow = { label: string; value: string };
type MonthlyCashFlowRow = { periodo: string; ingresos: string; egresos: string };

function decimal(value: Money): Decimal {
  return new Decimal(value);
}

function money(value: Decimal): string {
  return value.toFixed(2);
}

function isOperatingIncome(tipo: string): boolean {
  return tipo === "INGRESO_COMISION"
    || tipo === "INGRESO_PUNITORIO"
    || tipo === "INGRESO_ALQUILER_PROPIO"
    || tipo === "INGRESO_CONFECCION_CONTRATO";
}

function sourceType(row: DashboardTransactionRow): string {
  return row.tipo === "CONTRA_ASIENTO" ? (row.originType ?? row.tipo) : row.tipo;
}

export function calculateSignedFinancials(
  rows: DashboardTransactionRow[],
): FinancialTotals {
  let cobrado = new Decimal(0);
  let ingresosInmobiliaria = new Decimal(0);
  let gastosOperativos = new Decimal(0);

  for (const row of rows) {
    const tipo = sourceType(row);
    const amount = decimal(row.monto);
    if (tipo === "INGRESO_COBRO" && row.caja === "TERCEROS") {
      cobrado = cobrado.plus(amount);
    }
    if (isOperatingIncome(tipo) && row.caja === "OPERATIVA") {
      ingresosInmobiliaria = ingresosInmobiliaria.plus(amount);
    }
    if (tipo === "EGRESO_OPERATIVO" && row.caja === "OPERATIVA") {
      gastosOperativos = gastosOperativos.plus(amount);
    }
  }

  return {
    cobrado: money(cobrado),
    ingresosInmobiliaria: money(ingresosInmobiliaria),
    gastosOperativos: money(gastosOperativos),
    resultadoOperativo: money(ingresosInmobiliaria.plus(gastosOperativos)),
  };
}

/** Dashboard adapter around the shared decimal-safe pending-balance helper. */
export function calculatePendingAmount(
  monto: Money,
  aplicaciones: Array<Money | { monto_aplicado: Money }>,
): string {
  const normalized = aplicaciones.map((application) => ({
    monto_aplicado: typeof application === "object" && !(application instanceof Decimal)
      ? application.monto_aplicado
      : application,
  }));
  return money(calcularPendiente(monto, normalized));
}

export function groupByLabel(rows: GroupRow[]): GroupRow[] {
  const totals = new Map<string, Decimal>();
  for (const row of rows) {
    totals.set(row.label, (totals.get(row.label) ?? new Decimal(0)).plus(decimal(row.value)));
  }
  return [...totals].map(([label, value]) => ({ label, value: money(value) }));
}

/** Build normalized display points while preserving source order and strings. */
export function buildMonthlyCashFlow(rows: MonthlyCashFlowRow[]): ChartPoint[] {
  return rows.map((row) => ({
    label: row.periodo,
    valueA: row.ingresos,
    valueB: row.egresos,
  }));
}

/** Alias useful to chart consumers with generic two-series data. */
export const buildChartPoints = buildMonthlyCashFlow;

/**
 * Converts money values into display-only ratios. Ratios are never used to
 * derive or replace the original amount. A tiny non-zero bar keeps a zero
 * value discoverable to keyboard and screen-reader users.
 */
export function buildBars(rows: GroupRow[]): ChartBar[] {
  if (rows.length === 0) return [];
  const maximum = rows.reduce((max, row) => {
    const magnitude = decimal(row.value).abs();
    return magnitude.greaterThan(max) ? magnitude : max;
  }, new Decimal(0));
  if (maximum.isZero()) {
    return rows.map((row) => ({ label: row.label, value: row.value, ratio: 0.01 }));
  }
  return rows.map((row) => {
    const rawRatio = decimal(row.value).abs().div(maximum).toNumber();
    return {
      label: row.label,
      value: row.value,
      ratio: Math.max(0.01, Math.min(1, rawRatio)),
    };
  });
}
