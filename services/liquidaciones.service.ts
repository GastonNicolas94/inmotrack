import { Decimal } from "@prisma/client/runtime/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AdelantosService } from "@/services/adelantos.service";

export const LiquidacionesService = {
  async listar(id_propietario?: number) {
    return prisma.liquidacion.findMany({
      where: id_propietario ? { id_propietario } : undefined,
      include: { items: true, propietario: { select: { id: true, nombre: true } } },
      orderBy: { fecha_corrida: "desc" },
    });
  },

  /**
   * Genera una liquidación para un propietario en el rango [desde, hasta].
   *
   * `desde` se calcula internamente:
   * - Si existe una Liquidacion previa de este propietario, `desde` = fecha_hasta + 1 día
   * - Si no existe ninguna, `desde` = una fecha muy antigua (sin piso práctico)
   *
   * `hasta` es elegido por el operador (suele ser hoy).
   *
   * Base caja: selecciona AplicacionPago y Gasto por la fecha real de entrada
   * (Transaccion.fecha_transaccion para AplicacionPago, Gasto.creado_en para gastos)
   * dentro de [desde, hasta].
   *
   * Agrupa alquiler por id_periodo → un LiquidacionItem por período con AplicacionPago
   * real que lo sostiene.
   *
   * Agrupa gastos por id_propiedad, separado, con id_periodo = null.
   *
   * Si descontarAdelantos > 0, valida el total pendiente entre adelantos del propietario
   * y aplica por antigüedad, generando DeduccionAdelanto.
   */
  async generarParaPropietario(
    id_propietario: number,
    hasta: Date,
    descontarAdelantos: number | Decimal = 0
  ) {
    return prisma.$transaction(async (tx) => {
      // ─── Paso 1: Calcular `desde` ────────────────────────────────────────

      const ultimaLiquidacion = await tx.liquidacion.findFirst({
        where: { id_propietario },
        orderBy: { fecha_hasta: "desc" },
        take: 1,
      });

      const desde = ultimaLiquidacion
        ? new Date(ultimaLiquidacion.fecha_hasta.getTime() + 24 * 60 * 60 * 1000)
        : new Date("1900-01-01");

      // ─── Paso 2: Lock pesimista ─────────────────────────────────────────

      // Lock sobre AplicacionPago sin liquidar de este propietario
      await tx.$queryRawUnsafe(
        `SELECT ap.id FROM aplicaciones_pago ap
         JOIN cargos c ON c.id = ap.id_cargo
         JOIN periodos_pago pp ON pp.id = c.id_periodo
         JOIN contratos ct ON ct.id = pp.id_contrato
         JOIN propiedades prop ON prop.id = ct.id_propiedad
         WHERE c.tipo = 'ALQUILER' AND ap.id_liquidacion_item IS NULL
           AND prop.id_propietario = $1
         FOR UPDATE OF ap`,
        id_propietario
      );

      // Lock sobre Gasto sin liquidar de este propietario
      await tx.$queryRawUnsafe(
        `SELECT g.id FROM gastos g
         JOIN propiedades prop ON prop.id = g.id_propiedad
         WHERE g.cargo_a = 'PROPIETARIO' AND g.id_liquidacion_item IS NULL
           AND prop.id_propietario = $1
         FOR UPDATE OF g`,
        id_propietario
      );

      const montoDescontar = new Decimal(descontarAdelantos);

      // Si hay adelantos a descontar, lock también sobre las transacciones
      if (montoDescontar.greaterThan(0)) {
        await tx.$queryRawUnsafe(
          `SELECT t.id FROM transacciones t
           WHERE t.tipo = 'EGRESO_ADELANTO' AND t.id_propietario = $1
           FOR UPDATE OF t`,
          id_propietario
        );
      }

      // ─── Paso 3: Seleccionar AplicacionPago en rango por fecha ──────────

      const aplicaciones = await tx.aplicacionPago.findMany({
        where: {
          id_liquidacion_item: null,
          cargo: {
            tipo: "ALQUILER",
            periodo: { contrato: { propiedad: { id_propietario } } },
          },
          transaccion: {
            fecha_transaccion: { gte: desde, lte: hasta },
          },
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

      // ─── Paso 4: Seleccionar Gasto en rango ─────────────────────────────

      const gastos = await tx.gasto.findMany({
        where: {
          cargo_a: "PROPIETARIO",
          id_liquidacion_item: null,
          creado_en: { gte: desde, lte: hasta },
          propiedad: { id_propietario },
        },
        include: { propiedad: true },
      });

      // ─── Paso 5: Agrupar alquiler por id_periodo ────────────────────────

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

      // ─── Paso 6: Agrupar gastos por id_propiedad ────────────────────────

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

      // ─── Paso 7: Adelantos (si descontar > 0) ────────────────────────────

      let adelantosDescontados = new Decimal(0);
      const deduccionesAdelanto: Array<{
        id_transaccion: number;
        monto_descontado: Decimal;
      }> = [];

      if (montoDescontar.greaterThan(0)) {
        const pendiente = await AdelantosService.obtenerPendiente(id_propietario, tx);

        if (montoDescontar.greaterThan(pendiente.total)) {
          throw new Error(
            `No se puede descontar ${montoDescontar.toString()}: el total pendiente es ${pendiente.total.toString()}.`
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

      // ─── Paso 8: Totales de Liquidacion ─────────────────────────────────

      const montoBruto = Array.from(porPeriodo.values()).reduce(
        (acc, item) => acc.plus(item.monto_bruto),
        new Decimal(0)
      );

      const retenciones = Array.from(porPeriodo.values())
        .reduce((acc, item) => acc.plus(item.comision), new Decimal(0))
        .plus(Array.from(porPropiedad.values()).reduce((acc, item) => acc.plus(item.monto_gastos), new Decimal(0)));

      const montoNeto = montoBruto.minus(retenciones).minus(adelantosDescontados);

      // ─── Paso 9: Crear Liquidacion ──────────────────────────────────────

      const liquidacion = await tx.liquidacion.create({
        data: {
          id_propietario,
          fecha_desde: desde,
          fecha_hasta: hasta,
          monto_bruto: montoBruto,
          retenciones,
          adelantos_descontados: adelantosDescontados,
          monto_neto: montoNeto,
        },
      });

      // ─── Paso 10: Crear LiquidacionItem de alquiler ──────────────────────

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

        itemsAlquilerIds.push({
          id: liquidacionItem.id,
          aplicacionIds: item.aplicacionIds,
        });
      }

      // ─── Paso 11: Crear LiquidacionItem de gastos ──────────────────────

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

        itemsGastoIds.push({
          id: liquidacionItem.id,
          gastoIds: item.gastoIds,
        });
      }

      // ─── Paso 12: Sellar AplicacionPago ─────────────────────────────────

      for (const { id, aplicacionIds } of itemsAlquilerIds) {
        if (aplicacionIds.length > 0) {
          await tx.aplicacionPago.updateMany({
            where: { id: { in: aplicacionIds } },
            data: { id_liquidacion_item: id },
          });
        }
      }

      // ─── Paso 13: Sellar Gasto ──────────────────────────────────────────

      for (const { id, gastoIds } of itemsGastoIds) {
        if (gastoIds.length > 0) {
          await tx.gasto.updateMany({
            where: { id: { in: gastoIds } },
            data: { id_liquidacion_item: id },
          });
        }
      }

      // ─── Paso 14: Crear DeduccionAdelanto ──────────────────────────────

      for (const deduccion of deduccionesAdelanto) {
        await tx.deduccionAdelanto.create({
          data: {
            id_transaccion: deduccion.id_transaccion,
            id_liquidacion: liquidacion.id,
            monto_descontado: deduccion.monto_descontado,
          },
        });
      }

      // ─── Paso 15: Devolver Liquidacion con relaciones ──────────────────

      return tx.liquidacion.findUniqueOrThrow({
        where: { id: liquidacion.id },
        include: { items: true, deducciones: true },
      });
    });
  },

  async aprobar(id: number, id_usuario_creador: number) {
    return prisma.$transaction(async (tx) => {
      // Lock pesimista: dos aprobaciones simultáneas de la misma liquidación
      // (doble clic, dos pestañas) no deben generar dos EGRESO_LIQUIDACION.
      await tx.$queryRawUnsafe(`SELECT id FROM liquidaciones WHERE id = $1 FOR UPDATE`, id);
      const liquidacion = await tx.liquidacion.findUniqueOrThrow({ where: { id } });

      if (liquidacion.estado !== "PENDIENTE") {
        throw new Error("Solo se pueden aprobar liquidaciones en estado PENDIENTE.");
      }

      // Un neto negativo significa que el propietario recibió más en
      // adelantos de lo que este período le generó (adelanto sin respaldo
      // de alquiler cobrado) — el propietario le debe esa plata a la
      // inmobiliaria, no al revés. Aprobar tal cual generaría un
      // EGRESO_LIQUIDACION con signo positivo, rompiendo la convención de
      // signos del resto del sistema (EGRESO_* siempre negativo). El
      // mecanismo para cobrarle esa diferencia al propietario todavía no
      // está diseñado — por ahora se bloquea la aprobación.
      if (new Decimal(liquidacion.monto_neto).lessThan(0)) {
        throw new Error(
          "No se puede aprobar una liquidación con neto negativo (el propietario le debe a la inmobiliaria). Pendiente de diseño."
        );
      }

      await tx.transaccion.create({
        data: {
          tipo: "EGRESO_LIQUIDACION",
          caja_destino: "TERCEROS",
          monto: new Decimal(liquidacion.monto_neto).negated(),
          id_usuario_creador,
        },
      });

      return tx.liquidacion.update({ where: { id }, data: { estado: "APROBADA" } });
    });
  },

  async confirmarPago(id: number) {
    const liquidacion = await prisma.liquidacion.findUniqueOrThrow({ where: { id } });

    if (liquidacion.estado !== "APROBADA") {
      throw new Error("Solo se puede confirmar el pago de liquidaciones en estado APROBADA.");
    }

    return prisma.liquidacion.update({ where: { id }, data: { estado: "PAGADA" } });
  },
};
