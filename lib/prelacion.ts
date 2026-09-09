import { Decimal } from "@prisma/client/runtime/client";

export interface CargoPendienteSimulacion {
  id: number;
  tipo: "ALQUILER" | "GASTO" | "PUNITORIO" | "AJUSTE";
  pendiente: Decimal | string | number;
}

export interface AplicacionSimulada {
  id_cargo: number;
  monto_aplicado: Decimal;
}

/**
 * Simula, sin tocar la base, qué le pasaría a un monto si se registrara
 * como pago ahora — misma prelación que `PagosService.registrar`: 1)
 * punitorios, 2) alquiler/ajuste, 3) gastos, siempre más viejo primero
 * dentro de cada paso. `cargosPendientes` tiene que venir YA ordenado por
 * antigüedad real (creado_en asc) y ya filtrado a solo lo que el
 * inquilino puede deber (un GASTO a cargo del propietario no entra acá).
 */
export function simularPrelacion(
  cargosPendientes: CargoPendienteSimulacion[],
  montoAPagar: Decimal | string | number
): AplicacionSimulada[] {
  let saldo = new Decimal(montoAPagar);
  const aplicaciones: AplicacionSimulada[] = [];

  function aplicarPaso(filtro: (c: CargoPendienteSimulacion) => boolean) {
    for (const cargo of cargosPendientes.filter(filtro)) {
      if (saldo.lessThanOrEqualTo(0)) break;
      const pendiente = new Decimal(cargo.pendiente);
      if (pendiente.lessThanOrEqualTo(0)) continue;

      const abono = Decimal.min(saldo, pendiente);
      aplicaciones.push({ id_cargo: cargo.id, monto_aplicado: abono });
      saldo = saldo.minus(abono);
    }
  }

  aplicarPaso((c) => c.tipo === "PUNITORIO");
  aplicarPaso((c) => c.tipo === "ALQUILER" || c.tipo === "AJUSTE");
  aplicarPaso((c) => c.tipo === "GASTO");

  return aplicaciones;
}
