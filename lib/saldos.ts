// lib/saldos.ts
import { Decimal } from "@prisma/client/runtime/client";

/**
 * Cuánto queda de un monto original después de restarle sus aplicaciones.
 * Sirve tanto para el pendiente de un Cargo como para el disponible de un
 * pago (Transaccion) — mismo cálculo, distinto significado según el
 * contexto. Nunca se persiste el resultado.
 */
export function calcularPendiente(
  monto: Decimal | string | number,
  aplicaciones: { monto_aplicado: Decimal | string | number }[]
): Decimal {
  const aplicado = aplicaciones.reduce(
    (acc, a) => acc.plus(new Decimal(a.monto_aplicado)),
    new Decimal(0)
  );
  return new Decimal(monto).minus(aplicado);
}
