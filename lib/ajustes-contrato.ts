type IndiceActualizacion = "ICL" | "IPC" | "ACUERDO";

export type RequiereAjusteParams = {
  fechaInicio: Date;
  fechaUltimoAjuste: Date | null;
  mesesActualizacion: number | null;
  indiceActualizacion: IndiceActualizacion | null;
  periodoObjetivo: string;
};

function mesAbsoluto(fecha: Date): number {
  return fecha.getUTCFullYear() * 12 + fecha.getUTCMonth();
}

export function fechaPeriodo(periodo: string): Date {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(periodo);
  if (!match) throw new Error(`Período inválido: ${periodo}. Se esperaba YYYY-MM.`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
}

export function requiereAjuste({
  fechaInicio,
  fechaUltimoAjuste,
  mesesActualizacion,
  indiceActualizacion,
  periodoObjetivo,
}: RequiereAjusteParams): boolean {
  if (!indiceActualizacion || !mesesActualizacion || mesesActualizacion <= 0) return false;

  const base = fechaUltimoAjuste ?? fechaInicio;
  const objetivo = fechaPeriodo(periodoObjetivo);
  const mesesTranscurridos = mesAbsoluto(objetivo) - mesAbsoluto(base);

  return mesesTranscurridos >= mesesActualizacion;
}
