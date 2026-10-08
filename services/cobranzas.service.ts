import "server-only";

import { Decimal } from "@prisma/client/runtime/client";
import { prisma } from "@/lib/db";
import { AppClock } from "@/lib/app-clock";
import { traceServiceObject } from "@/lib/observability/tracing";
import { argentinaDateOnly, calcularEstadoCobranza, type FilaCobranza } from "@/lib/cobranzas";

/**
 * Vista de cobranza read-only. Cada fila representa un período contractual real,
 * consolidando todos sus cargos y aplicaciones (incluidos contra-asientos).
 * Registrar sigue delegando en PagosService; nunca se modifica la prelación.
 */
export const CobranzasService = traceServiceObject("CobranzasService", {
  async listar(): Promise<FilaCobranza[]> {
    const hoy = argentinaDateOnly(await AppClock.now());
    const periodos = await prisma.periodoPago.findMany({
      where: { cargos: { some: {} } },
      select: {
        id: true,
        periodo: true,
        fecha_vencimiento: true,
        id_contrato: true,
        contrato: {
          select: {
            inquilino: { select: { nombre: true } },
            propiedad: { select: { direccion: true } },
          },
        },
        cargos: {
          select: {
            monto: true,
            aplicaciones: { select: { monto_aplicado: true } },
          },
        },
      },
      orderBy: [{ fecha_vencimiento: "desc" }, { id: "desc" }],
    });

    return periodos.map((p) => {
      const total = p.cargos.reduce((sum, cargo) => sum.plus(cargo.monto), new Decimal(0));
      const aplicado = p.cargos.reduce(
        (sum, cargo) => cargo.aplicaciones.reduce(
          (acc, application) => acc.plus(application.monto_aplicado), sum,
        ),
        new Decimal(0),
      );
      const status = calcularEstadoCobranza(total, aplicado, p.fecha_vencimiento, hoy);
      return {
        id: p.id,
        contratoId: p.id_contrato,
        inquilino: p.contrato.inquilino.nombre,
        propiedad: p.contrato.propiedad.direccion,
        periodo: p.periodo,
        vencimiento: p.fecha_vencimiento,
        total: total.toFixed(2),
        ...status,
      };
    });
  },
});
