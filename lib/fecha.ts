/**
 * Un campo `@db.Date` de Postgres (fecha_inicio, fecha_fin,
 * fecha_vencimiento) se guarda como medianoche UTC, sin componente de
 * hora real. El proceso de Next corre en America/Cordoba (UTC-3) — leer
 * esa fecha con getters locales (`.getMonth()`, `toLocaleDateString`)
 * corre el día uno para atrás, siempre, sin excepción:
 *
 *   new Date("2026-09-01").toLocaleDateString("es-AR") → "31/8/2026"
 *
 * Estas dos funciones son el único lugar donde se lee un campo de este
 * tipo — usan getters UTC para no arrastrar el timezone del proceso.
 */

/** Año, mes (1-12) y día de un campo `@db.Date`, leídos en UTC. */
export function partesFechaUTC(fecha: Date | string) {
  const d = new Date(fecha);
  return {
    anio: d.getUTCFullYear(),
    mes: d.getUTCMonth() + 1,
    dia: d.getUTCDate(),
  };
}

/** Formatea un campo `@db.Date` para mostrar, sin el corrimiento de día. */
export function formatFechaLocal(fecha: Date | string): string {
  const { anio, mes, dia } = partesFechaUTC(fecha);
  return new Date(anio, mes - 1, dia).toLocaleDateString("es-AR");
}

/**
 * Fecha de vencimiento de un período: día 10 del MISMO mes (mes es 1-12),
 * corrido al siguiente día hábil si cae sábado o domingo. No contempla
 * feriados argentinos — solo fines de semana (fuera de alcance).
 */
export function calcularVencimientoPeriodo(anio: number, mes: number): Date {
  let vencimiento = new Date(Date.UTC(anio, mes - 1, 10));
  const diaSemana = vencimiento.getUTCDay(); // 0=domingo, 6=sábado
  if (diaSemana === 6) vencimiento = new Date(Date.UTC(anio, mes - 1, 12));
  if (diaSemana === 0) vencimiento = new Date(Date.UTC(anio, mes - 1, 11));
  return vencimiento;
}

/**
 * Año, mes y día de HOY, en hora de Argentina — nunca del timezone del
 * proceso (Vercel corre las funciones serverless en UTC por default; usar
 * new Date().getMonth() filtraría mal entre las 21:00 y las 23:59 hora
 * Argentina del último día de cada mes, que en UTC ya es el día siguiente).
 *
 * Override para pruebas/demos: si `FECHA_SIMULADA` (formato "YYYY-MM-DD")
 * está seteada, se devuelve esa fecha en vez de la real — pensado para
 * probar el cierre de períodos sin esperar meses reales ni insertar datos
 * ya atrasados a mano. Nunca en producción: si `NODE_ENV === "production"`
 * y la variable está seteada, tira en vez de aceptarla en silencio — un
 * override de "hoy" mal limpiado en el entorno productivo podría manipular
 * cuándo el sistema considera vencido un período.
 */
export function hoyEnArgentina(): { anio: number; mes: number; dia: number } {
  const fechaSimulada = process.env.FECHA_SIMULADA;
  if (fechaSimulada) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "FECHA_SIMULADA no puede estar seteada en producción — revisar la configuración del entorno."
      );
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaSimulada);
    if (!match) {
      throw new Error(
        `FECHA_SIMULADA tiene un formato inválido: "${fechaSimulada}" (esperado "YYYY-MM-DD").`
      );
    }
    const anio = Number(match[1]);
    const mes = Number(match[2]);
    const dia = Number(match[3]);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) {
      throw new Error(
        `FECHA_SIMULADA tiene una fecha fuera de rango: "${fechaSimulada}" (mes debe ser 01-12, día 01-31).`
      );
    }
    return { anio, mes, dia };
  }

  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (tipo: string) => Number(partes.find((p) => p.type === tipo)!.value);
  return { anio: get("year"), mes: get("month"), dia: get("day") };
}

/**
 * Mes calendario ("YYYY-MM") de una fecha con hora real (`DateTime`, no
 * `@db.Date`) — en hora de Argentina, mismo criterio que hoyEnArgentina(),
 * para no mezclar convenciones de timezone dentro de este archivo. No
 * respeta FECHA_SIMULADA (esa fecha es "hoy", no una fecha histórica
 * arbitraria que se le pasa a esta función).
 */
export function mesEnArgentina(fecha: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit",
  }).formatToParts(fecha);
  const get = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
  return `${get("year")}-${get("month")}`;
}

/**
 * Día calendario ("YYYY-MM-DD") de una fecha con hora real (`DateTime`,
 * no `@db.Date`) — en hora de Argentina, mismo criterio que
 * hoyEnArgentina()/mesEnArgentina(). Usado por el motor de punitorios
 * para saber en qué día calendario cayó un pago (Transaccion.fecha_transaccion)
 * y así calcular el saldo pendiente histórico correcto día por día.
 */
export function diaEnArgentina(fecha: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(fecha);
  const get = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
