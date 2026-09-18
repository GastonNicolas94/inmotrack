import { Decimal } from "@prisma/client/runtime/client";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Clock } from "@/lib/clock";
import { AppClock } from "@/lib/app-clock";
import { aplicarCreditoDisponible } from "@/services/creditos.service";
import type { GastoInput } from "@/schemas/gasto.schema";
import { traceServiceObject } from "@/lib/observability/tracing";

type Dependencies = { prisma: PrismaClient; clock: Clock };

export function createGastosService(deps: Dependencies) {
  return {
    async crear(data: GastoInput & { fecha_gasto?: string }) {
      const ahora = data.fecha_gasto ? new Date(data.fecha_gasto) : await deps.clock.now();
      return deps.prisma.$transaction(async (tx) => {
        const gasto = await tx.gasto.create({
          data: {
            id_propiedad: data.id_propiedad ?? null,
            id_contrato: data.id_contrato ?? null,
            concepto: data.concepto,
            categoria_interno: data.categoria_interno ?? null,
            monto: data.monto,
            tipo: data.tipo,
            cargo_a: data.cargo_a,
            creado_en: ahora,
          },
        });

        if (data.id_contrato) {
          const periodoAbierto = await tx.periodoPago.findFirst({
            where: { id_contrato: data.id_contrato, estado_ciclo: "ABIERTO" },
          });

          if (periodoAbierto) {
            const cargo = await tx.cargo.create({
              data: {
                id_periodo: periodoAbierto.id,
                id_contrato: data.id_contrato,
                tipo: "GASTO",
                monto: data.monto,
                id_gasto: gasto.id,
                descripcion: data.concepto,
                creado_en: ahora,
              },
            });

            if (data.cargo_a === "INQUILINO") {
              await aplicarCreditoDisponible(tx, {
                id_contrato: data.id_contrato,
                id_cargo: cargo.id,
                tipo_cargo: "GASTO",
                pendiente_cargo: new Decimal(data.monto),
                pct_comision: new Decimal(0),
                es_propia: false,
                id_usuario_creador: null,
              });
            }
          }
        }

        return gasto;
      });
    },

    async marcarPagado(id: number, id_usuario_creador: number) {
      const ahora = await deps.clock.now();
      return deps.prisma.$transaction(async (tx) => {
        const gasto = await tx.gasto.findUniqueOrThrow({ where: { id } });

        if (gasto.estado_pago === "PAGADO_PROVEEDOR") {
          throw new Error("Este gasto ya fue marcado como pagado.");
        }

        const actualizado = await tx.gasto.update({
          where: { id },
          data: { estado_pago: "PAGADO_PROVEEDOR" },
        });

        const esGastoPropio = gasto.cargo_a === "INMOBILIARIA";

        await tx.transaccion.create({
          data: {
            tipo: esGastoPropio ? "EGRESO_OPERATIVO" : "EGRESO_TERCEROS",
            caja_destino: esGastoPropio ? "OPERATIVA" : "TERCEROS",
            monto: -Number(gasto.monto),
            fecha_transaccion: ahora,
            id_contrato: gasto.id_contrato,
            id_usuario_creador,
          },
        });

        return actualizado;
      });
    },

    async listar() {
      return deps.prisma.gasto.findMany({
        select: {
          id: true,
          concepto: true,
          categoria_interno: true,
          monto: true,
          cargo_a: true,
          estado_pago: true,
          propiedad: { select: { direccion: true } },
        },
        orderBy: { id: "desc" },
      });
    },
  };
}

export const GastosService = traceServiceObject("GastosService", createGastosService({ prisma, clock: AppClock }));
