import { Decimal } from "@prisma/client/runtime/client";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Clock } from "@/lib/clock";
import { AppClock } from "@/lib/app-clock";
import { AdelantosService } from "@/services/adelantos.service";
import { traceServiceObject } from "@/lib/observability/tracing";
import { prorratearMonto } from "@/lib/copropiedad";

type Dependencies = { prisma: PrismaClient; clock: Clock };

export type ConceptoLiquidacionSeleccionado = {
  tipo: "ALQUILER" | "GASTO";
  id: number;
};

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
      const liquidacion = await deps.prisma.liquidacion.findUnique({
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
              porcentaje_participacion: true,
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
              aplicaciones_asignadas: {
                select: {
                  monto_asignado: true,
                  aplicacion_pago: {
                    select: {
                      id: true,
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
              gastos_asignados: {
                select: {
                  monto_asignado: true,
                  gasto: {
                    select: {
                      id: true,
                      concepto: true,
                      categoria_interno: true,
                      tipo: true,
                      estado_pago: true,
                      creado_en: true,
                    },
                  },
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

      if (!liquidacion) return null;

      return {
        ...liquidacion,
        items: liquidacion.items.map((item) => {
          const {
            aplicaciones_asignadas,
            gastos_asignados,
            ...resto
          } = item;
          const aplicacionesAsignadas = aplicaciones_asignadas.map((asignacion) => ({
            ...asignacion.aplicacion_pago,
            monto_aplicado: asignacion.monto_asignado,
          }));
          const gastosAsignados = gastos_asignados.map((asignacion) => ({
            ...asignacion.gasto,
            monto: asignacion.monto_asignado,
          }));

          return {
            ...resto,
            aplicaciones:
              aplicacionesAsignadas.length > 0 ? aplicacionesAsignadas : item.aplicaciones,
            gastos_item: gastosAsignados.length > 0 ? gastosAsignados : item.gastos_item,
          };
        }),
      };
    },

    async listarPendientes(id_propietario: number, hasta: Date) {
      const [aplicaciones, gastos] = await Promise.all([
        deps.prisma.aplicacionPago.findMany({
          where: {
            cargo: { tipo: "ALQUILER" },
            transaccion: { fecha_transaccion: { lte: hasta } },
            OR: [
              { asignaciones: { some: { id_propietario, id_liquidacion_item: null } } },
              {
                asignaciones: { none: {} },
                cargo: {
                  periodo: {
                    contrato: {
                      propiedad: {
                        OR: [
                          { copropietarios: { some: { id_propietario } } },
                          { copropietarios: { none: {} }, id_propietario },
                        ],
                      },
                    },
                  },
                },
              },
            ],
          },
          include: {
            transaccion: { select: { fecha_transaccion: true } },
            asignaciones: true,
            cargo: {
              include: {
                periodo: {
                  include: {
                    contrato: {
                      include: {
                        propiedad: {
                          include: {
                            copropietarios: { orderBy: { id_propietario: "asc" } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: { id: "asc" },
        }),
        deps.prisma.gasto.findMany({
          where: {
            cargo_a: "PROPIETARIO",
            creado_en: { lte: hasta },
            OR: [
              { asignaciones: { some: { id_propietario, id_liquidacion_item: null } } },
              {
                asignaciones: { none: {} },
                propiedad: {
                  is: {
                    OR: [
                      { copropietarios: { some: { id_propietario } } },
                      { copropietarios: { none: {} }, id_propietario },
                    ],
                  },
                },
              },
            ],
          },
          include: {
            asignaciones: true,
            propiedad: {
              include: {
                copropietarios: { orderBy: { id_propietario: "asc" } },
              },
            },
          },
          orderBy: { id: "asc" },
        }),
      ]);

      const alquileres = aplicaciones.flatMap((aplicacion) => {
        const propiedad = aplicacion.cargo.periodo.contrato.propiedad;
        const asignacionExistente = aplicacion.asignaciones.find(
          (item) => item.id_propietario === id_propietario && item.id_liquidacion_item === null,
        );
        const participaciones =
          propiedad.copropietarios.length > 0
            ? propiedad.copropietarios.map((item) => ({
                id_propietario: item.id_propietario,
                porcentaje: item.porcentaje,
              }))
            : [{ id_propietario: propiedad.id_propietario, porcentaje: 100 }];
        const calculada = asignacionExistente
          ? {
              porcentaje: new Decimal(asignacionExistente.porcentaje_participacion),
              monto: new Decimal(asignacionExistente.monto_asignado),
            }
          : (() => {
              const item = prorratearMonto(aplicacion.monto_aplicado, participaciones).find(
                (asignacion) => asignacion.id_propietario === id_propietario,
              );
              return item ? { porcentaje: new Decimal(item.porcentaje), monto: item.monto } : null;
            })();
        if (!calculada) return [];

        return [{
          tipo: "ALQUILER" as const,
          id: aplicacion.id,
          fecha: aplicacion.transaccion.fecha_transaccion,
          propiedad: { id: propiedad.id, direccion: propiedad.direccion },
          periodo: aplicacion.cargo.periodo.periodo,
          concepto: aplicacion.cargo.descripcion || "Alquiler",
          porcentaje_participacion: calculada.porcentaje.toFixed(2),
          monto: calculada.monto.toFixed(2),
        }];
      });

      const gastosPendientes = gastos.flatMap((gasto) => {
        if (!gasto.propiedad) return [];
        const asignacionExistente = gasto.asignaciones.find(
          (item) => item.id_propietario === id_propietario && item.id_liquidacion_item === null,
        );
        const participaciones =
          gasto.propiedad.copropietarios.length > 0
            ? gasto.propiedad.copropietarios.map((item) => ({
                id_propietario: item.id_propietario,
                porcentaje: item.porcentaje,
              }))
            : [{ id_propietario: gasto.propiedad.id_propietario, porcentaje: 100 }];
        const calculada = asignacionExistente
          ? {
              porcentaje: new Decimal(asignacionExistente.porcentaje_participacion),
              monto: new Decimal(asignacionExistente.monto_asignado),
            }
          : (() => {
              const item = prorratearMonto(gasto.monto, participaciones).find(
                (asignacion) => asignacion.id_propietario === id_propietario,
              );
              return item ? { porcentaje: new Decimal(item.porcentaje), monto: item.monto } : null;
            })();
        if (!calculada) return [];

        return [{
          tipo: "GASTO" as const,
          id: gasto.id,
          fecha: gasto.creado_en,
          propiedad: { id: gasto.propiedad.id, direccion: gasto.propiedad.direccion },
          periodo: null,
          concepto: gasto.concepto,
          porcentaje_participacion: calculada.porcentaje.toFixed(2),
          monto: calculada.monto.toFixed(2),
        }];
      });

      return [...alquileres, ...gastosPendientes].sort(
        (a, b) => a.fecha.getTime() - b.fecha.getTime() || a.id - b.id,
      );
    },

    async generarParaPropietario(
      id_propietario: number,
      hasta: Date,
      descontarAdelantos: number | Decimal = 0,
      conceptosSeleccionados?: ConceptoLiquidacionSeleccionado[],
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
        const seleccionExplicita = conceptosSeleccionados !== undefined;
        const idsAplicacionesSeleccionadas = (conceptosSeleccionados ?? [])
          .filter((item) => item.tipo === "ALQUILER")
          .map((item) => item.id);
        const idsGastosSeleccionados = (conceptosSeleccionados ?? [])
          .filter((item) => item.tipo === "GASTO")
          .map((item) => item.id);

        // Bloqueamos las fuentes seleccionadas. Para llamadas legacy sin selección
        // conservamos el bloqueo por ventana temporal.
        if (seleccionExplicita) {
          for (const id of idsAplicacionesSeleccionadas) {
            await tx.$queryRawUnsafe(
              `SELECT id FROM aplicaciones_pago WHERE id = $1 FOR UPDATE`,
              id,
            );
          }
          for (const id of idsGastosSeleccionados) {
            await tx.$queryRawUnsafe(
              `SELECT id FROM gastos WHERE id = $1 FOR UPDATE`,
              id,
            );
          }
        } else {
          await tx.$queryRawUnsafe(
            `SELECT ap.id
             FROM aplicaciones_pago ap
             JOIN transacciones t ON t.id = ap.id_transaccion
             JOIN cargos c ON c.id = ap.id_cargo
             JOIN periodos_pago pe ON pe.id = c.id_periodo
             JOIN contratos ct ON ct.id = pe.id_contrato
             JOIN propiedades prop ON prop.id = ct.id_propiedad
             WHERE c.tipo = 'ALQUILER'
               AND t.fecha_transaccion >= $2
               AND t.fecha_transaccion <= $3
               AND (
                 EXISTS (
                   SELECT 1
                   FROM aplicaciones_pago_propietarios apa
                   WHERE apa.id_aplicacion_pago = ap.id
                     AND apa.id_propietario = $1
                     AND apa.id_liquidacion_item IS NULL
                 )
                 OR (
                   NOT EXISTS (
                     SELECT 1
                     FROM aplicaciones_pago_propietarios apa_any
                     WHERE apa_any.id_aplicacion_pago = ap.id
                   )
                   AND (
                     EXISTS (
                       SELECT 1
                       FROM propiedades_propietarios pp
                       WHERE pp.id_propiedad = prop.id
                         AND pp.id_propietario = $1
                     )
                     OR (
                       NOT EXISTS (
                         SELECT 1
                         FROM propiedades_propietarios pp_any
                         WHERE pp_any.id_propiedad = prop.id
                       )
                       AND prop.id_propietario = $1
                     )
                   )
                 )
               )
             FOR UPDATE OF ap`,
            id_propietario,
            desde,
            hasta,
          );
  
          await tx.$queryRawUnsafe(
            `SELECT g.id
             FROM gastos g
             JOIN propiedades prop ON prop.id = g.id_propiedad
             WHERE g.cargo_a = 'PROPIETARIO'
               AND g.creado_en >= $2
               AND g.creado_en <= $3
               AND (
                 EXISTS (
                   SELECT 1
                   FROM gastos_propietarios gp
                   WHERE gp.id_gasto = g.id
                     AND gp.id_propietario = $1
                     AND gp.id_liquidacion_item IS NULL
                 )
                 OR (
                   NOT EXISTS (
                     SELECT 1
                     FROM gastos_propietarios gp_any
                     WHERE gp_any.id_gasto = g.id
                   )
                   AND (
                     EXISTS (
                       SELECT 1
                       FROM propiedades_propietarios pp
                       WHERE pp.id_propiedad = prop.id
                         AND pp.id_propietario = $1
                     )
                     OR (
                       NOT EXISTS (
                         SELECT 1
                         FROM propiedades_propietarios pp_any
                         WHERE pp_any.id_propiedad = prop.id
                       )
                       AND prop.id_propietario = $1
                     )
                   )
                 )
               )
             FOR UPDATE OF g`,
            id_propietario,
            desde,
            hasta,
          );
  
  
        }

        const montoDescontar = new Decimal(descontarAdelantos);

        if (montoDescontar.greaterThan(0)) {
          await tx.$queryRawUnsafe(
            `SELECT t.id FROM transacciones t
             WHERE t.tipo = 'EGRESO_ADELANTO' AND t.id_propietario = $1
             FOR UPDATE OF t`,
            id_propietario,
          );
        }

        const aplicacionesFuente = await tx.aplicacionPago.findMany({
          where: {
            ...(seleccionExplicita ? { id: { in: idsAplicacionesSeleccionadas } } : {}),
            cargo: { tipo: "ALQUILER" },
            transaccion: {
              fecha_transaccion: seleccionExplicita ? { lte: hasta } : { gte: desde, lte: hasta },
            },
            OR: [
              {
                asignaciones: {
                  some: { id_propietario, id_liquidacion_item: null },
                },
              },
              {
                asignaciones: { none: {} },
                cargo: {
                  tipo: "ALQUILER",
                  periodo: {
                    contrato: {
                      propiedad: {
                        OR: [
                          { copropietarios: { some: { id_propietario } } },
                          {
                            copropietarios: { none: {} },
                            id_propietario,
                          },
                        ],
                      },
                    },
                  },
                },
              },
            ],
          },
          include: {
            asignaciones: true,
            cargo: {
              include: {
                periodo: {
                  include: {
                    contrato: {
                      include: {
                        propiedad: {
                          include: {
                            copropietarios: {
                              orderBy: { id_propietario: "asc" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });

        for (const aplicacion of aplicacionesFuente) {
          if (aplicacion.asignaciones.length > 0) continue;

          const propiedad = aplicacion.cargo.periodo.contrato.propiedad;
          const participaciones =
            propiedad.copropietarios.length > 0
              ? propiedad.copropietarios.map((participacion) => ({
                  id_propietario: participacion.id_propietario,
                  porcentaje: participacion.porcentaje,
                }))
              : [{ id_propietario: propiedad.id_propietario, porcentaje: 100 }];

          const asignaciones = prorratearMonto(aplicacion.monto_aplicado, participaciones);
          await tx.aplicacionPagoPropietario.createMany({
            data: asignaciones.map((asignacion) => ({
              id_aplicacion_pago: aplicacion.id,
              id_propietario: asignacion.id_propietario,
              porcentaje_participacion: asignacion.porcentaje,
              monto_asignado: asignacion.monto,
            })),
            skipDuplicates: true,
          });
        }

        const gastosFuente = await tx.gasto.findMany({
          where: {
            ...(seleccionExplicita ? { id: { in: idsGastosSeleccionados } } : {}),
            cargo_a: "PROPIETARIO",
            creado_en: seleccionExplicita ? { lte: hasta } : { gte: desde, lte: hasta },
            OR: [
              {
                asignaciones: {
                  some: { id_propietario, id_liquidacion_item: null },
                },
              },
              {
                asignaciones: { none: {} },
                propiedad: {
                  is: {
                    OR: [
                      { copropietarios: { some: { id_propietario } } },
                      { copropietarios: { none: {} }, id_propietario },
                    ],
                  },
                },
              },
            ],
          },
          include: {
            asignaciones: true,
            propiedad: {
              include: {
                copropietarios: {
                  orderBy: { id_propietario: "asc" },
                },
              },
            },
          },
        });

        for (const gasto of gastosFuente) {
          if (gasto.asignaciones.length > 0 || !gasto.propiedad) continue;

          const participaciones =
            gasto.propiedad.copropietarios.length > 0
              ? gasto.propiedad.copropietarios.map((participacion) => ({
                  id_propietario: participacion.id_propietario,
                  porcentaje: participacion.porcentaje,
                }))
              : [{ id_propietario: gasto.propiedad.id_propietario, porcentaje: 100 }];

          const asignaciones = prorratearMonto(gasto.monto, participaciones);
          await tx.gastoPropietario.createMany({
            data: asignaciones.map((asignacion) => ({
              id_gasto: gasto.id,
              id_propietario: asignacion.id_propietario,
              porcentaje_participacion: asignacion.porcentaje,
              monto_asignado: asignacion.monto,
            })),
            skipDuplicates: true,
          });
        }

        const asignacionesAplicacion = await tx.aplicacionPagoPropietario.findMany({
          where: {
            id_propietario,
            id_liquidacion_item: null,
            aplicacion_pago: {
              ...(seleccionExplicita ? { id: { in: idsAplicacionesSeleccionadas } } : {}),
              cargo: { tipo: "ALQUILER" },
              transaccion: {
                fecha_transaccion: seleccionExplicita ? { lte: hasta } : { gte: desde, lte: hasta },
              },
            },
          },
          include: {
            aplicacion_pago: {
              include: {
                asignaciones: { orderBy: { id_propietario: "asc" } },
                cargo: {
                  include: {
                    periodo: {
                      include: {
                        contrato: {
                          include: { propiedad: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: { id: "asc" },
        });

        const asignacionesGasto = await tx.gastoPropietario.findMany({
          where: {
            id_propietario,
            id_liquidacion_item: null,
            gasto: {
              ...(seleccionExplicita ? { id: { in: idsGastosSeleccionados } } : {}),
              cargo_a: "PROPIETARIO",
              creado_en: seleccionExplicita ? { lte: hasta } : { gte: desde, lte: hasta },
            },
          },
          include: {
            gasto: {
              include: {
                asignaciones: { orderBy: { id_propietario: "asc" } },
              },
            },
          },
          orderBy: { id: "asc" },
        });

        if (seleccionExplicita) {
          const seleccionadosEncontrados =
            asignacionesAplicacion.length + asignacionesGasto.length;
          if (seleccionadosEncontrados !== (conceptosSeleccionados ?? []).length) {
            throw new Error(
              "Alguno de los conceptos seleccionados ya no está pendiente o no pertenece al propietario.",
            );
          }
        }

        interface ItemAlquiler {
          id_periodo: number;
          id_propiedad: number;
          porcentaje_participacion: Decimal;
          monto_bruto: Decimal;
          comision: Decimal;
          asignacionIds: number[];
          aplicacionIdsLegacy: number[];
        }

        const porPeriodo = new Map<string, ItemAlquiler>();

        for (const asignacion of asignacionesAplicacion) {
          const aplicacion = asignacion.aplicacion_pago;
          const idPeriodo = aplicacion.cargo.id_periodo;
          const idPropiedad = aplicacion.cargo.periodo.contrato.propiedad.id;
          const porcentaje = new Decimal(asignacion.porcentaje_participacion);
          const clave = `${idPeriodo}:${idPropiedad}:${porcentaje.toFixed(2)}`;
          const pctComision = new Decimal(aplicacion.cargo.periodo.contrato.pct_comision);

          const totalComision = new Decimal(aplicacion.monto_aplicado)
            .times(pctComision)
            .dividedBy(100)
            .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
          const comisionAsignada =
            prorratearMonto(
              totalComision,
              aplicacion.asignaciones.map((item) => ({
                id_propietario: item.id_propietario,
                porcentaje: item.porcentaje_participacion,
              })),
            ).find((item) => item.id_propietario === id_propietario)?.monto ?? new Decimal(0);

          const entry = porPeriodo.get(clave) ?? {
            id_periodo: idPeriodo,
            id_propiedad: idPropiedad,
            porcentaje_participacion: porcentaje,
            monto_bruto: new Decimal(0),
            comision: new Decimal(0),
            asignacionIds: [],
            aplicacionIdsLegacy: [],
          };

          entry.monto_bruto = entry.monto_bruto.plus(asignacion.monto_asignado);
          entry.comision = entry.comision.plus(comisionAsignada);
          entry.asignacionIds.push(asignacion.id);
          if (aplicacion.asignaciones.length === 1) {
            entry.aplicacionIdsLegacy.push(aplicacion.id);
          }
          porPeriodo.set(clave, entry);
        }

        interface ItemGasto {
          id_propiedad: number;
          porcentaje_participacion: Decimal;
          monto_gastos: Decimal;
          asignacionIds: number[];
          gastoIdsLegacy: number[];
        }

        const porPropiedad = new Map<string, ItemGasto>();

        for (const asignacion of asignacionesGasto) {
          if (!asignacion.gasto.id_propiedad) continue;
          const porcentaje = new Decimal(asignacion.porcentaje_participacion);
          const clave = `${asignacion.gasto.id_propiedad}:${porcentaje.toFixed(2)}`;
          const entry = porPropiedad.get(clave) ?? {
            id_propiedad: asignacion.gasto.id_propiedad,
            porcentaje_participacion: porcentaje,
            monto_gastos: new Decimal(0),
            asignacionIds: [],
            gastoIdsLegacy: [],
          };
          entry.monto_gastos = entry.monto_gastos.plus(asignacion.monto_asignado);
          entry.asignacionIds.push(asignacion.id);
          if (asignacion.gasto.asignaciones.length === 1) {
            entry.gastoIdsLegacy.push(asignacion.gasto.id);
          }
          porPropiedad.set(clave, entry);
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

        for (const item of porPeriodo.values()) {
          const liquidacionItem = await tx.liquidacionItem.create({
            data: {
              id_liquidacion: liquidacion.id,
              id_periodo: item.id_periodo,
              id_propiedad: item.id_propiedad,
              porcentaje_participacion: item.porcentaje_participacion,
              monto_bruto: item.monto_bruto,
              comision: item.comision,
              gastos: new Decimal(0),
              monto_neto: item.monto_bruto.minus(item.comision),
            },
          });

          await tx.aplicacionPagoPropietario.updateMany({
            where: { id: { in: item.asignacionIds } },
            data: { id_liquidacion_item: liquidacionItem.id },
          });

          if (item.aplicacionIdsLegacy.length > 0) {
            await tx.aplicacionPago.updateMany({
              where: { id: { in: item.aplicacionIdsLegacy } },
              data: { id_liquidacion_item: liquidacionItem.id },
            });
          }
        }

        for (const item of porPropiedad.values()) {
          const liquidacionItem = await tx.liquidacionItem.create({
            data: {
              id_liquidacion: liquidacion.id,
              id_periodo: null,
              id_propiedad: item.id_propiedad,
              porcentaje_participacion: item.porcentaje_participacion,
              monto_bruto: new Decimal(0),
              comision: new Decimal(0),
              gastos: item.monto_gastos,
              monto_neto: item.monto_gastos.negated(),
            },
          });

          await tx.gastoPropietario.updateMany({
            where: { id: { in: item.asignacionIds } },
            data: { id_liquidacion_item: liquidacionItem.id },
          });

          if (item.gastoIdsLegacy.length > 0) {
            await tx.gasto.updateMany({
              where: { id: { in: item.gastoIdsLegacy } },
              data: { id_liquidacion_item: liquidacionItem.id },
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
