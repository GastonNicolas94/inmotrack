import { Decimal } from "@prisma/client/runtime/client";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Clock } from "@/lib/clock";
import { AppClock } from "@/lib/app-clock";
import { AdelantosService } from "@/services/adelantos.service";
import { traceServiceObject } from "@/lib/observability/tracing";

type Dependencies = { prisma: PrismaClient; clock: Clock };

export function createLiquidacionesService(deps: Dependencies) {
  return {
    async listar(id_propietario?: number) {
      return deps.prisma.liquidacion.findMany({
        where: id_propietario ? { id_propietario } : undefined,
        select: {
          id: true,
          id_propietario: true,
          fecha_corrida: true,
          monto_bruto: true,
          retenciones: true,
          monto_neto: true,
          estado: true,
          propietario: { select: { nombre: true } },
        },
        orderBy: { fecha_corrida: "desc" },
      });
    },

    async obtenerDetalle(id: number) {
      return deps.prisma.liquidacion.findUnique({
        where: { id },
        select: {
          id: true,
          id_propietario: true,
          fecha_corrida: true,
          fecha_desde: true,
          fecha_hasta: true,
          monto_bruto: true,
          retenciones: true,
          adelantos_descontados: true,
          monto_neto: true,
          estado: true,
          propietario: { select: { id: true, nombre: true } },
          items: {
            select: {
              id: true,
              id_periodo: true,
              id_propiedad: true,
              monto_bruto: true,
              comision: true,
              gastos: true,
              monto_neto: true,
              propiedad: { select: { id: true, direccion: true } },
              periodo: {
                select: {
                  id: true,
                  periodo: true,
                  contrato: {
                    select: {
                      id: true,
                      inquilino: { select: { id: true, nombre: true } },
                    },
                  },
                },
              },
              aplicaciones: {
                select: {
                  id: true,
                  monto_aplicado: true,
                  transaccion: {
                    select: { id: true, tipo: true, fecha_transaccion: true },
                  },
                  cargo: {
                    select: {
                      id: true,
                      tipo: true,
                      monto: true,
                      descripcion: true,
                    },
                  },
                },
                orderBy: { id: "asc" },
              },
              gastos_item: {
                select: {
                  id: true,
                  concepto: true,
                  categoria_interno: true,
                  tipo: true,
                  monto: true,
                  estado_pago: true,
                  creado_en: true,
                },
                orderBy: { id: "asc" },
              },
            },
            orderBy: [{ id_propiedad: "asc" }, { id: "asc" }],
          },
          deducciones: {
            select: {
              id: true,
              id_transaccion: true,
              monto_descontado: true,
              transaccion: {
                select: {
                  id: true,
                  monto: true,
                  fecha_transaccion: true,
                  comentario: true,
                },
              },
            },
            orderBy: { id: "asc" },
          },
        },
      });
    },

    async generarParaPropietario(
      id_propietario: number,
      hasta: Date,
      descontarAdelantos: number | Decimal = 0,
    ) {
      const fechaCorrida = await deps.clock.now();
      return deps.prisma.$transaction(async (tx) => {
        const ultimaLiquidacion = await tx.liquidacion.findFirst({
          where: { id_propietario },
          orderBy: { fecha_hasta: "desc" },
          take: 1,
        });

        const desde = ultimaLiquidacion
          ? new Date(ultimaLiquidacion.fecha_hasta.getTime() + 24 * 60 * 60 * 1000)
          : new Date("1900-01-01");

        await tx.$queryRawUnsafe(
          `SELECT ap.id FROM aplicaciones_pago ap
           JOIN cargos c ON c.id = ap.id_cargo
           JOIN periodos_pago pp ON pp.id = c.id_periodo
           JOIN contratos ct ON ct.id = pp.id_contrato
           JOIN propiedades prop ON prop.id = ct.id_propiedad
           WHERE c.tipo = 'ALQUILER' AND ap.id_liquidacion_item IS NULL
             AND prop.id_propietario = $1
           FOR UPDATE OF ap`,
          id_propietario,
        );

        await tx.$queryRawUnsafe(
          `SELECT g.id FROM gastos g
           JOIN propiedades prop ON prop.id = g.id_propiedad
           WHERE g.cargo_a = 'PROPIETARIO' AND g.id_liquidacion_item IS NULL
             AND prop.id_propietario = $1
           FOR UPDATE OF g`,
          id_propietario,
        );

        const montoDescontar = new Decimal(descontarAdelantos);

        if (montoDescontar.greaterThan(0)) {
          await tx.$queryRawUnsafe(
            `SELECT t.id FROM transacciones t
             WHERE t.tipo = 'EGRESO_ADELANTO' AND t.id_propietario = $1
             FOR UPDATE OF t`,
            id_propietario,
          );
        }

        const aplicaciones = await tx.aplicacionPago.findMany({
          where: {
            id_liquidacion_item: null,
            cargo: {
              tipo: "ALQUILER",
              periodo: { contrato: { propiedad: { id_propietario } } },
            },
            transaccion: { fecha_transaccion: { gte: desde, lte: hasta } },
          },
          include: {
            cargo: {
              include: {
                periodo: { include: { contrato: { include: { propiedad: true } } } },
              },
            },
            transaccion: true,
          },
        });

        const gastos = await tx.gasto.findMany({
          where: {
            cargo_a: "PROPIETARIO",
            id_liquidacion_item: null,
            creado_en: { gte: desde, lte: hasta },
            propiedad: { id_propietario },
          },
          include: { propiedad: true },
        });

        interface ItemAlquiler {
          id_periodo: number;
          id_propiedad: number;
          monto_bruto: Decimal;
          comision: Decimal;
          pct_comision: Decimal;
          aplicacionIds: number[];
        }

        const porPeriodo = new Map<number, ItemAlquiler>();

        for (const aplicacion of aplicaciones) {
          const idPeriodo = aplicacion.cargo.id_periodo;
          const idPropiedad = aplicacion.cargo.periodo.contrato.propiedad.id;
          const pctComision = new Decimal(aplicacion.cargo.periodo.contrato.pct_comision);

          const entry = porPeriodo.get(idPeriodo) ?? {
            id_periodo: idPeriodo,
            id_propiedad: idPropiedad,
            monto_bruto: new Decimal(0),
            comision: new Decimal(0),
            pct_comision: pctComision,
            aplicacionIds: [] as number[],
          };

          const monto = new Decimal(aplicacion.monto_aplicado);
          entry.monto_bruto = entry.monto_bruto.plus(monto);
          entry.comision = entry.comision.plus(monto.times(pctComision).dividedBy(100));
          entry.aplicacionIds.push(aplicacion.id);
          porPeriodo.set(idPeriodo, entry);
        }

        interface ItemGasto {
          id_propiedad: number;
          monto_gastos: Decimal;
          gastoIds: number[];
        }

        const porPropiedad = new Map<number, ItemGasto>();

        for (const gasto of gastos) {
          const idPropiedad = gasto.id_propiedad!;
          const entry = porPropiedad.get(idPropiedad) ?? {
            id_propiedad: idPropiedad,
            monto_gastos: new Decimal(0),
            gastoIds: [] as number[],
          };
          entry.monto_gastos = entry.monto_gastos.plus(gasto.monto);
          entry.gastoIds.push(gasto.id);
          porPropiedad.set(idPropiedad, entry);
        }

        let adelantosDescontados = new Decimal(0);
        const deduccionesAdelanto: Array<{
          id_transaccion: number;
          monto_descontado: Decimal;
        }> = [];

        if (montoDescontar.greaterThan(0)) {
          const pendiente = await AdelantosService.obtenerPendiente(id_propietario, tx);
          if (montoDescontar.greaterThan(pendiente.total)) {
            throw new Error(
              `No se puede descontar ${montoDescontar.toString()}: el total pendiente es ${pendiente.total.toString()}.`,
            );
          }

          let pendientePorAplicar = montoDescontar;
          for (const adelanto of pendiente.detalle) {
            if (pendientePorAplicar.lessThanOrEqualTo(0)) break;
            const aDescontar = Decimal.min(adelanto.pendiente, pendientePorAplicar);
            deduccionesAdelanto.push({
              id_transaccion: adelanto.id_transaccion,
              monto_descontado: aDescontar,
            });
            adelantosDescontados = adelantosDescontados.plus(aDescontar);
            pendientePorAplicar = pendientePorAplicar.minus(aDescontar);
          }
        }

        const montoBruto = Array.from(porPeriodo.values()).reduce(
          (acc, item) => acc.plus(item.monto_bruto),
          new Decimal(0),
        );

        const retenciones = Array.from(porPeriodo.values())
          .reduce((acc, item) => acc.plus(item.comision), new Decimal(0))
          .plus(
            Array.from(porPropiedad.values()).reduce(
              (acc, item) => acc.plus(item.monto_gastos),
              new Decimal(0),
            ),
          );

        const montoNeto = montoBruto.minus(retenciones).minus(adelantosDescontados);

        const liquidacion = await tx.liquidacion.create({
          data: {
            id_propietario,
            fecha_corrida: fechaCorrida,
            fecha_desde: desde,
            fecha_hasta: hasta,
            monto_bruto: montoBruto,
            retenciones,
            adelantos_descontados: adelantosDescontados,
            monto_neto: montoNeto,
          },
        });

        const itemsAlquilerIds: Array<{ id: number; aplicacionIds: number[] }> = [];
        for (const item of porPeriodo.values()) {
          const liquidacionItem = await tx.liquidacionItem.create({
            data: {
              id_liquidacion: liquidacion.id,
              id_periodo: item.id_periodo,
              id_propiedad: item.id_propiedad,
              monto_bruto: item.monto_bruto,
              comision: item.comision,
              gastos: new Decimal(0),
              monto_neto: item.monto_bruto.minus(item.comision),
            },
          });
          itemsAlquilerIds.push({ id: liquidacionItem.id, aplicacionIds: item.aplicacionIds });
        }

        const itemsGastoIds: Array<{ id: number; gastoIds: number[] }> = [];
        for (const item of porPropiedad.values()) {
          const liquidacionItem = await tx.liquidacionItem.create({
            data: {
              id_liquidacion: liquidacion.id,
              id_periodo: null,
              id_propiedad: item.id_propiedad,
              monto_bruto: new Decimal(0),
              comision: new Decimal(0),
              gastos: item.monto_gastos,
              monto_neto: item.monto_gastos.negated(),
            },
          });
          itemsGastoIds.push({ id: liquidacionItem.id, gastoIds: item.gastoIds });
        }

        for (const { id, aplicacionIds } of itemsAlquilerIds) {
          if (aplicacionIds.length > 0) {
            await tx.aplicacionPago.updateMany({
              where: { id: { in: aplicacionIds } },
              data: { id_liquidacion_item: id },
            });
          }
        }

        for (const { id, gastoIds } of itemsGastoIds) {
          if (gastoIds.length > 0) {
            await tx.gasto.updateMany({
              where: { id: { in: gastoIds } },
              data: { id_liquidacion_item: id },
            });
          }
        }

        for (const deduccion of deduccionesAdelanto) {
          await tx.deduccionAdelanto.create({
            data: {
              id_transaccion: deduccion.id_transaccion,
              id_liquidacion: liquidacion.id,
              monto_descontado: deduccion.monto_descontado,
            },
          });
        }

        return tx.liquidacion.findUniqueOrThrow({
          where: { id: liquidacion.id },
          include: { items: true, deducciones: true },
        });
      });
    },

    async aprobar(id: number, id_usuario_creador: number) {
      const ahora = await deps.clock.now();
      return deps.prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe(`SELECT id FROM liquidaciones WHERE id = $1 FOR UPDATE`, id);
        const liquidacion = await tx.liquidacion.findUniqueOrThrow({ where: { id } });

        if (liquidacion.estado !== "PENDIENTE") {
          throw new Error("Solo se pueden aprobar liquidaciones en estado PENDIENTE.");
        }

        if (new Decimal(liquidacion.monto_neto).lessThan(0)) {
          throw new Error(
            "No se puede aprobar una liquidación con neto negativo (el propietario le debe a la inmobiliaria). Pendiente de diseño.",
          );
        }

        await tx.transaccion.create({
          data: {
            tipo: "EGRESO_LIQUIDACION",
            caja_destino: "TERCEROS",
            monto: new Decimal(liquidacion.monto_neto).negated(),
            fecha_transaccion: ahora,
            id_usuario_creador,
          },
        });

        return tx.liquidacion.update({ where: { id }, data: { estado: "APROBADA" } });
      });
    },

    async confirmarPago(id: number) {
      const liquidacion = await deps.prisma.liquidacion.findUniqueOrThrow({ where: { id } });
      if (liquidacion.estado !== "APROBADA") {
        throw new Error("Solo se puede confirmar el pago de liquidaciones en estado APROBADA.");
      }
      return deps.prisma.liquidacion.update({ where: { id }, data: { estado: "PAGADA" } });
    },
  };
}

export const LiquidacionesService = traceServiceObject("LiquidacionesService", createLiquidacionesService({ prisma, clock: AppClock }));

export type LiquidacionDetalle = NonNullable<
  Awaited<ReturnType<typeof LiquidacionesService.obtenerDetalle>>
>;
