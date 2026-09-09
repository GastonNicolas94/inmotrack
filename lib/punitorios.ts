// lib/punitorios.ts
import { Decimal } from "@prisma/client/runtime/client";
import { calcularPendiente } from "@/lib/saldos";
import { diaEnArgentina } from "@/lib/fecha";

interface AplicacionConFecha {
  monto_aplicado: Decimal | string | number;
  transaccion: { fecha_transaccion: Date };
}

/**
 * Interés simple acumulado día por día entre `desde` y `hasta` (ambos
 * inclusive, fechas UTC-midnight tipo @db.Date) sobre un Cargo cuyo monto
 * original es `monto` y cuyas aplicaciones son `aplicaciones`.
 *
 * Cada día usa el saldo pendiente HISTÓRICO real de ese día — no el
 * pendiente de hoy aplicado a todo el rango. Una aplicación cuenta desde
 * el mismo día calendario (en hora de Argentina) en que ocurrió su
 * Transaccion, inclusive.
 *
 * Sin interés compuesto: esta función no sabe nada de "punitorios sobre
 * punitorios" — ese filtro (nunca pasarle un Cargo PUNITORIO como base)
 * es responsabilidad de quien la llama, no de este cálculo.
 */
export function calcularInteresAcumulado(
  monto: Decimal | string | number,
  aplicaciones: AplicacionConFecha[],
  desde: Date,
  hasta: Date,
  pctDiario: Decimal | string | number
): Decimal {
  const tasa = new Decimal(pctDiario);
  let acumulado = new Decimal(0);

  const cursor = new Date(desde);
  while (cursor.getTime() <= hasta.getTime()) {
    const diaStr = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-${String(
      cursor.getUTCDate()
    ).padStart(2, "0")}`;

    const aplicacionesHastaEseDia = aplicaciones.filter(
      (a) => diaEnArgentina(a.transaccion.fecha_transaccion) <= diaStr
    );
    const pendienteEseDia = calcularPendiente(monto, aplicacionesHastaEseDia);
    acumulado = acumulado.plus(pendienteEseDia.times(tasa).dividedBy(100));

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return acumulado;
}
