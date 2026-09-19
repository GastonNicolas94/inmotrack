import { Decimal } from "@prisma/client/runtime/client";

type ValorDecimal = Decimal | number | string;

export interface ParticipacionPropietario {
  id_propietario: number;
  porcentaje: ValorDecimal;
}

export interface AsignacionProrrateada {
  id_propietario: number;
  porcentaje: Decimal;
  monto: Decimal;
}

export function normalizarParticipaciones(
  participaciones: ParticipacionPropietario[],
): Array<{ id_propietario: number; porcentaje: Decimal }> {
  if (participaciones.length === 0) {
    throw new Error("La propiedad debe tener al menos un propietario.");
  }

  const ids = new Set<number>();
  const normalizadas = participaciones.map((participacion) => {
    if (ids.has(participacion.id_propietario)) {
      throw new Error("Un propietario no puede repetirse en la misma propiedad.");
    }
    ids.add(participacion.id_propietario);

    const porcentaje = new Decimal(participacion.porcentaje);
    if (porcentaje.lessThanOrEqualTo(0) || porcentaje.greaterThan(100)) {
      throw new Error("Cada porcentaje de participación debe ser mayor a 0 y menor o igual a 100.");
    }

    return {
      id_propietario: participacion.id_propietario,
      porcentaje,
    };
  });

  const total = normalizadas.reduce(
    (acumulado, participacion) => acumulado.plus(participacion.porcentaje),
    new Decimal(0),
  );

  if (!total.equals(100)) {
    throw new Error("Los porcentajes de participación deben sumar exactamente 100%.");
  }

  return normalizadas.sort((a, b) => a.id_propietario - b.id_propietario);
}

export function prorratearMonto(
  monto: ValorDecimal,
  participaciones: ParticipacionPropietario[],
): AsignacionProrrateada[] {
  const normalizadas = normalizarParticipaciones(participaciones);
  const montoNormalizado = new Decimal(monto).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  if (montoNormalizado.isNegative()) {
    throw new Error("El monto a prorratear no puede ser negativo.");
  }

  const centavosTotales = montoNormalizado.times(100);

  const calculadas = normalizadas.map((participacion) => {
    const centavosExactos = centavosTotales
      .times(participacion.porcentaje)
      .dividedBy(100);
    const centavosBase = centavosExactos.toDecimalPlaces(0, Decimal.ROUND_FLOOR);

    return {
      ...participacion,
      centavosBase,
      resto: centavosExactos.minus(centavosBase),
    };
  });

  const centavosAsignados = calculadas.reduce(
    (acumulado, asignacion) => acumulado.plus(asignacion.centavosBase),
    new Decimal(0),
  );
  let centavosRestantes = centavosTotales.minus(centavosAsignados).toNumber();

  const prioridadResto = [...calculadas].sort((a, b) => {
    const comparacionResto = b.resto.comparedTo(a.resto);
    if (comparacionResto !== 0) return comparacionResto;
    return a.id_propietario - b.id_propietario;
  });

  const extras = new Set<number>();
  for (const asignacion of prioridadResto) {
    if (centavosRestantes <= 0) break;
    extras.add(asignacion.id_propietario);
    centavosRestantes -= 1;
  }

  return calculadas.map((asignacion) => ({
    id_propietario: asignacion.id_propietario,
    porcentaje: asignacion.porcentaje,
    monto: asignacion.centavosBase
      .plus(extras.has(asignacion.id_propietario) ? 1 : 0)
      .dividedBy(100),
  }));
}
