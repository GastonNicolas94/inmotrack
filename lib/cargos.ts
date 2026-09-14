export type TipoCargoCodigo =
  | "ALQUILER"
  | "GASTO"
  | "CONFECCION_CONTRATO"
  | "PUNITORIO"
  | "AJUSTE";

const ETIQUETAS_TIPO_CARGO: Record<TipoCargoCodigo, string> = {
  ALQUILER: "Alquiler",
  GASTO: "Gasto",
  CONFECCION_CONTRATO: "Confección de contrato",
  PUNITORIO: "Punitorio",
  AJUSTE: "Ajuste",
};

const TIPOS_CARGO_CON_PUNITORIO: ReadonlySet<TipoCargoCodigo> = new Set([
  "ALQUILER",
  "GASTO",
  "CONFECCION_CONTRATO",
  "AJUSTE",
]);

export function etiquetaTipoCargo(tipo: string): string {
  return ETIQUETAS_TIPO_CARGO[tipo as TipoCargoCodigo] ?? tipo;
}

export function admitePunitorio(tipo: string): boolean {
  return TIPOS_CARGO_CON_PUNITORIO.has(tipo as TipoCargoCodigo);
}
