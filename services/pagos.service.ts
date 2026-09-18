// services/pagos.service.ts
import { Decimal } from "@prisma/client/runtime/client";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Clock } from "@/lib/clock";
import { AppClock } from "@/lib/app-clock";
import { checkIdempotencyKey, persistIdempotencyKey } from "@/lib/idempotency";
import { calcularPendiente } from "@/lib/saldos";
import { traceServiceObject } from "@/lib/observability/tracing";

export type ResultadoPago = {
  procesado: true;
  aplicado_punitorios: string;
  aplicado_capital: string;
  saldo_sobrante: string;
};

type Dependencies = { prisma: PrismaClient; clock: Clock };

export function createPagosService(deps: Dependencies) {
  return {
    async registrar({
      id_contrato,
      monto_pagado,
      idempotency_key,
      id_usuario_creador,
    }: {
      id_contrato: number;
      monto_pagado: number;
      idempotency_key: string;
      id_usuario_creador: number;
    }): Promise<ResultadoPago> {
      const ahora = await deps.clock.now();
      const hoy = await deps.clock.today();
      const hoyDate = new Date(Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia));

      return deps.prisma.$transaction(
        async (tx) => {
          await checkIdempotencyKey(tx, idempotency_key);

          const contrato = await tx.contrato.findUniqueOrThrow({
            where: { id: id_contrato },
            include: { propiedad: true },
          });

          await tx.$queryRawUnsafe(
            `SELECT id FROM cargos WHERE id_contrato = $1 FOR UPDATE`,
            id_contrato
          );

          let saldo = new Decimal(monto_pagado);
          let aplicadoPunitorios = new Decimal(0);
          let aplicadoCapital = new Decimal(0);

          const txnCobro = await tx.transaccion.create({
            data: {
              tipo: "INGRESO_COBRO",
              caja_destino: "TERCEROS",
              monto: saldo,
              fecha_transaccion: ahora,
              id_contrato,
              id_usuario_creador,
            },
          });

          const todosCargos = await tx.cargo.findMany({
            where: { id_contrato },
            include: { aplicaciones: true, gasto: true },
            orderBy: { creado_en: "asc" },
          });

          for (const cargo of todosCargos.filter((c) => c.tipo === "PUNITORIO")) {
            if (saldo.lessThanOrEqualTo(0)) break;
            const deuda = calcularPendiente(cargo.monto, cargo.aplicaciones);
            if (deuda.lessThanOrEqualTo(0)) continue;

            const abono = Decimal.min(saldo, deuda);
            await tx.aplicacionPago.create({
              data: { id_transaccion: txnCobro.id, id_cargo: cargo.id, monto_aplicado: abono },
            });
            await tx.transaccion.create({
              data: {
                tipo: "INGRESO_PUNITORIO",
                caja_destino: "OPERATIVA",
                monto: abono,
                fecha_transaccion: ahora,
                id_contrato,
                id_usuario_creador,
                id_txn_origen: txnCobro.id,
              },
            });

            saldo = saldo.minus(abono);
            aplicadoPunitorios = aplicadoPunitorios.plus(abono);
          }

          for (const cargo of todosCargos.filter((c) => c.tipo === "ALQUILER" || c.tipo === "AJUSTE")) {
            if (saldo.lessThanOrEqualTo(0)) break;
            const deuda = calcularPendiente(cargo.monto, cargo.aplicaciones);
            if (deuda.lessThanOrEqualTo(0)) continue;

            const abono = Decimal.min(saldo, deuda);
            await tx.aplicacionPago.create({
              data: { id_transaccion: txnCobro.id, id_cargo: cargo.id, monto_aplicado: abono },
            });

            if (cargo.tipo === "ALQUILER") {
              const esPropia = contrato.propiedad.es_propia;
              const pctComision = new Decimal(contrato.pct_comision);
              const montoComision = abono.times(pctComision).dividedBy(100);
              if (montoComision.greaterThan(0)) {
                await tx.transaccion.create({
                  data: {
                    tipo: esPropia ? "INGRESO_ALQUILER_PROPIO" : "INGRESO_COMISION",
                    caja_destino: "OPERATIVA",
                    monto: montoComision,
                    fecha_transaccion: ahora,
                    id_contrato,
                    id_usuario_creador,
                    id_txn_origen: txnCobro.id,
                  },
                });
              }
            }

            saldo = saldo.minus(abono);
            aplicadoCapital = aplicadoCapital.plus(abono);
          }

          if (saldo.greaterThan(0)) {
            for (const cargo of todosCargos.filter(
              (c) =>
                c.tipo === "CONFECCION_CONTRATO" ||
                (c.tipo === "GASTO" && c.gasto?.cargo_a === "INQUILINO")
            )) {
              if (saldo.lessThanOrEqualTo(0)) break;
              const deuda = calcularPendiente(cargo.monto, cargo.aplicaciones);
              if (deuda.lessThanOrEqualTo(0)) continue;

              const abono = Decimal.min(saldo, deuda);
              await tx.aplicacionPago.create({
                data: { id_transaccion: txnCobro.id, id_cargo: cargo.id, monto_aplicado: abono },
              });

              if (cargo.tipo === "CONFECCION_CONTRATO") {
                await tx.transaccion.create({
                  data: {
                    tipo: "INGRESO_CONFECCION_CONTRATO",
                    caja_destino: "OPERATIVA",
                    monto: abono,
                    fecha_transaccion: ahora,
                    id_contrato,
                    id_usuario_creador,
                    id_txn_origen: txnCobro.id,
                  },
                });
              }

              saldo = saldo.minus(abono);
            }
          }

          if (contrato.estado === "MOROSO") {
            const cargosAlquilerFrescos = await tx.cargo.findMany({
              where: { id_contrato, tipo: "ALQUILER" },
              include: { aplicaciones: true },
            });
            const cargosPendientesVencidos = cargosAlquilerFrescos.filter((c) =>
              calcularPendiente(c.monto, c.aplicaciones).greaterThan(0)
            );
            const periodosConDeuda = await tx.periodoPago.findMany({
              where: {
                id: { in: cargosPendientesVencidos.map((c) => c.id_periodo) },
                fecha_vencimiento: { lt: hoyDate },
              },
            });
            if (periodosConDeuda.length < 2) {
              await tx.contrato.update({ where: { id: id_contrato }, data: { estado: "ACTIVO" } });
            }
          }

          await persistIdempotencyKey(tx, idempotency_key, 201);

          return {
            procesado: true as const,
            aplicado_punitorios: aplicadoPunitorios.toFixed(2),
            aplicado_capital: aplicadoCapital.toFixed(2),
            saldo_sobrante: saldo.toFixed(2),
          };
        },
        { timeout: 30_000 }
      );
    },

    async listarRecientes(limit = 50) {
      const aplicaciones = await deps.prisma.aplicacionPago.findMany({
        where: { cargo: { tipo: "ALQUILER" } },
        select: {
          id: true,
          monto_aplicado: true,
          transaccion: { select: { fecha_transaccion: true } },
          cargo: {
            select: {
              periodo: {
                select: {
                  id_contrato: true,
                  periodo: true,
                  contrato: {
                    select: {
                      inquilino: { select: { nombre: true } },
                      propiedad: { select: { direccion: true } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { transaccion: { fecha_transaccion: "desc" } },
        take: limit,
      });

      return aplicaciones.map((a) => ({
        id: a.id,
        fecha: a.transaccion.fecha_transaccion,
        monto: a.monto_aplicado.toString(),
        contrato_id: a.cargo.periodo.id_contrato,
        inquilino: a.cargo.periodo.contrato.inquilino.nombre,
        direccion: a.cargo.periodo.contrato.propiedad.direccion,
        periodo: a.cargo.periodo.periodo,
      }));
    },
  };
}

export const PagosService = traceServiceObject("PagosService", createPagosService({ prisma, clock: AppClock }));
