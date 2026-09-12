import { hoyEnArgentina, mesEnArgentina } from "@/lib/fecha";
import { z } from "zod";
import type {
  DashboardFilters,
  DashboardPortfolio,
  DashboardSearchParams,
  DashboardTab,
} from "@/lib/dashboard/types";

const ARGENTINA_OFFSET_HOURS = 3;
const DEFAULT_TAB: DashboardTab = "operativo";
const DEFAULT_PORTFOLIO: DashboardPortfolio = "todas";

function firstValue(
  input: DashboardSearchParams | URLSearchParams,
  key: string,
): string | undefined {
  if (input instanceof URLSearchParams) return input.get(key) ?? undefined;
  const value = input[key];
  return Array.isArray(value) ? value[0] : value;
}

const periodSchema = z.string().regex(/^\d{4}-\d{2}$/).refine((value) => {
  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  return year >= 1 && month >= 1 && month <= 12;
});

const tabSchema = z.enum(["operativo", "financiero"] as const);
const portfolioSchema = z.enum(["todas", "propias", "terceros"] as const);
const propertySchema = z.union([
  z.literal("todos"),
  z.string().regex(/^\d+$/).refine((value) => {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0;
  }),
]).transform((value) => value === "todos" ? null : Number(value));

/** Returns UTC instants corresponding to midnight in Argentina for a month. */
export function getArgentinaMonthRange(periodo: string): {
  inicio: Date;
  finExclusivo: Date;
} {
  if (!periodSchema.safeParse(periodo).success) {
    throw new RangeError(`Período inválido: ${periodo}`);
  }

  const [yearText, monthText] = periodo.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const argentinaMidnight = (monthIndex: number) => {
    const date = new Date(0);
    date.setUTCFullYear(year, monthIndex, 1);
    date.setUTCHours(ARGENTINA_OFFSET_HOURS, 0, 0, 0);
    return date;
  };
  const inicio = argentinaMidnight(month - 1);
  const finExclusivo = argentinaMidnight(month);
  return { inicio, finExclusivo };
}

function currentArgentinaPeriod(now: Date): string {
  if (Number.isNaN(now.getTime())) {
    const { anio, mes } = hoyEnArgentina();
    return `${anio}-${String(mes).padStart(2, "0")}`;
  }
  return mesEnArgentina(now);
}

export function parseDashboardFilters(
  input: DashboardSearchParams | URLSearchParams,
  now: Date = new Date(),
): DashboardFilters {
  const defaultPeriod = currentArgentinaPeriod(now);
  const requestedPeriod = firstValue(input, "periodo");
  const periodo = periodSchema.catch(defaultPeriod).parse(requestedPeriod);
  const tab: DashboardTab = tabSchema.catch(DEFAULT_TAB).parse(firstValue(input, "tab"));
  const cartera: DashboardPortfolio = portfolioSchema.catch(DEFAULT_PORTFOLIO)
    .parse(firstValue(input, "cartera"));
  const propiedadId = propertySchema.optional().catch(null).parse(firstValue(input, "propiedad")) ?? null;
  const { inicio, finExclusivo } = getArgentinaMonthRange(periodo);

  return {
    tab,
    periodo,
    propiedadId,
    cartera,
    periodoInicio: inicio,
    periodoFinExclusivo: finExclusivo,
  };
}

export function serializeDashboardFilters(
  filters: DashboardFilters,
  overrides: Partial<Pick<DashboardFilters, "tab" | "periodo" | "propiedadId" | "cartera">> = {},
): string {
  const tab = overrides.tab ?? filters.tab;
  const periodo = overrides.periodo ?? filters.periodo;
  const propiedadId = overrides.propiedadId === undefined
    ? filters.propiedadId
    : overrides.propiedadId;
  const cartera = overrides.cartera ?? filters.cartera;
  const query = new URLSearchParams();
  query.set("tab", tab);
  query.set("periodo", periodo);
  query.set("propiedad", propiedadId === null ? "todos" : String(propiedadId));
  query.set("cartera", cartera);
  return query.toString();
}
