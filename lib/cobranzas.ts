import { Decimal } from "@prisma/client/runtime/client";

export type EstadoCobranza = "PENDIENTE" | "VENCIDO" | "COBRADO";
export type FiltroCobranza = "todos" | "pendientes" | "vencidos" | "cobrados";
export type FilaCobranza = {
  id: number;
  contratoId: number;
  inquilino: string;
  propiedad: string;
  periodo: string;
  vencimiento: Date;
  total: string;
  pagado: string;
  pendiente: string;
  estado: EstadoCobranza;
};

export const ESTADOS_COBRANZA: Record<FiltroCobranza, string> = {
  todos: "Todos",
  pendientes: "Pendientes",
  vencidos: "Vencidos",
  cobrados: "Cobrados",
};

export function argentinaDateOnly(now: Date): Date {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const n = (name: string) => Number(p.find((part) => part.type === name)?.value);
  return new Date(Date.UTC(n("year"), n("month") - 1, n("day")));
}

export function calcularEstadoCobranza(
  total: Decimal | string | number,
  aplicado: Decimal | string | number,
  vencimiento: Date,
  hoy: Date,
): { estado: EstadoCobranza; pendiente: string; pagado: string } {
  const amount = new Decimal(total);
  const paid = new Decimal(aplicado);
  const remaining = Decimal.max(amount.minus(paid), new Decimal(0));
  return {
    estado: remaining.isZero() ? "COBRADO" : vencimiento < hoy ? "VENCIDO" : "PENDIENTE",
    pendiente: remaining.toFixed(2),
    pagado: paid.toFixed(2),
  };
}

export function filtrarCobranzas(
  rows: FilaCobranza[],
  filtro: FiltroCobranza,
  query: string,
): FilaCobranza[] {
  const buscar = query.trim().toLocaleLowerCase("es");
  return rows.filter((row) => {
    const estado = filtro === "todos"
      || (filtro === "cobrados" && row.estado === "COBRADO")
      || (filtro === "vencidos" && row.estado === "VENCIDO")
      || (filtro === "pendientes" && row.estado !== "COBRADO");
    return estado && (!buscar || [row.inquilino, row.propiedad, row.periodo, String(row.contratoId)].some(
      (field) => field.toLocaleLowerCase("es").includes(buscar),
    ));
  });
}

export function conteosCobranzas(rows: FilaCobranza[]) {
  return {
    todos: rows.length,
    pendientes: rows.filter((row) => row.estado !== "COBRADO").length,
    vencidos: rows.filter((row) => row.estado === "VENCIDO").length,
    cobrados: rows.filter((row) => row.estado === "COBRADO").length,
  };
}
