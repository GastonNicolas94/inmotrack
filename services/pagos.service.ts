// services/pagos.service.ts
import { Decimal } from "@prisma/client/runtime/client";
import { prisma } from "@/lib/db";
import { checkIdempotencyKey, persistIdempotencyKey } from "@/lib/idempotency";
import { calcularPendiente } from "@/lib/saldos";

export type ResultadoPago = {
  procesado: true;
  aplicado_punitorios: string;
  aplicado_capital: string;
  saldo_sobrante: string;
};

export const PagosService = {
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
    return prisma.$transaction(
      async (tx) => {
        await checkIdempotencyKey(tx, idempotency_key);

        const contrato = await tx.contrato.findUniqueOrThrow({
          where: { id: id_contrato },
          include: { propiedad: true },
        });

        // Lock de los cargos del contrato — evita doble aplicación en paralelo
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
            id_contrato,
            id_usuario_creador,
          },
        });

        // Traer TODOS los cargos del contrato (de cualquier período, cerrado
        // o abierto) con sus aplicaciones, ordenados por antigüedad real —
        // así la deuda más vieja se cobra primero, sin ningún mecanismo de
        // arrastre dedicado.
        const todosCargos = await tx.cargo.findMany({
          where: { id_contrato },
          include: { aplicaciones: true, gasto: true },
          orderBy: { creado_en: "asc" },
        });

        // ── Paso 1: punitorios pendientes, más antiguos primero ──
        for (const cargo of todosCargos.filter((c) => c.tipo === "PUNITORIO")) {
          if (saldo.lessThanOrEqualTo(0)) break;
          const deuda = calcularPendiente(cargo.monto, cargo.aplicaciones);
          if (deuda.lessThanOrEqualTo(0)) continue;

          const abono = Decimal.min(saldo, deuda);
          await tx.aplicacionPago.create({
            data: { id_transaccion: txnCobro.id, id_cargo: cargo.id, monto_aplicado: abono },
          });

          // El punitorio es 100% de la inmobiliaria, nunca se liquida al
          // propietario (decisión de negocio, motor de punitorios,
          // 2026-08-27) — mismo patrón que la comisión: se reconoce como
          // ingreso operativo en el momento del cobro, trazado hacia el
          // cobro que lo generó.
          await tx.transaccion.create({
            data: {
              tipo: "INGRESO_PUNITORIO",
              caja_destino: "OPERATIVA",
              monto: abono,
              id_contrato,
              id_usuario_creador,
              id_txn_origen: txnCobro.id,
            },
          });

          saldo = saldo.minus(abono);
          aplicadoPunitorios = aplicadoPunitorios.plus(abono);
        }

        // ── Paso 2: alquiler + ajustes (capital), más antiguo primero ──
        for (const cargo of todosCargos.filter((c) => c.tipo === "ALQUILER" || c.tipo === "AJUSTE")) {
          if (saldo.lessThanOrEqualTo(0)) break;
          const deuda = calcularPendiente(cargo.monto, cargo.aplicaciones);
          if (deuda.lessThanOrEqualTo(0)) continue;

          const abono = Decimal.min(saldo, deuda);
          await tx.aplicacionPago.create({
            data: { id_transaccion: txnCobro.id, id_cargo: cargo.id, monto_aplicado: abono },
          });

          // La comisión solo aplica sobre alquiler real, no sobre ajustes
          // (un AJUSTE ya representa una corrección, no un alquiler nuevo).
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
                  id_contrato,
                  id_usuario_creador,
                  // Traza hacia el cobro que la generó: un contra-asiento sobre
                  // txnCobro debe poder encontrar y revertir esta comisión también.
                  id_txn_origen: txnCobro.id,
                },
              });
            }
          }

          saldo = saldo.minus(abono);
          aplicadoCapital = aplicadoCapital.plus(abono);
        }

        // ── Paso 3: gastos a cargo del inquilino, más antiguos primero ──
        if (saldo.greaterThan(0)) {
          for (const cargo of todosCargos.filter(
            (c) => c.tipo === "GASTO" && c.gasto?.cargo_a === "INQUILINO"
          )) {
            if (saldo.lessThanOrEqualTo(0)) break;
            const deuda = calcularPendiente(cargo.monto, cargo.aplicaciones);
            if (deuda.lessThanOrEqualTo(0)) continue;

            const abono = Decimal.min(saldo, deuda);
            await tx.aplicacionPago.create({
              data: { id_transaccion: txnCobro.id, id_cargo: cargo.id, monto_aplicado: abono },
            });

            // La confección de contrato es plata que nunca fue del
            // propietario — no es una comisión (no hay reparto), es
            // ingreso de la inmobiliaria al 100% desde el momento en que
            // se cobra. Se reconoce ahora mismo, no espera a ninguna
            // liquidación.
            if (cargo.gasto?.tipo === "CONFECCION_CONTRATO") {
              await tx.transaccion.create({
                data: {
                  tipo: "INGRESO_CONFECCION_CONTRATO",
                  caja_destino: "OPERATIVA",
                  monto: abono,
                  id_contrato,
                  id_usuario_creador,
                  id_txn_origen: txnCobro.id,
                },
              });
            }

            saldo = saldo.minus(abono);
          }
        }

        // El sobrante NO se persiste — queda como la diferencia entre
        // txnCobro.monto y la suma de sus aplicaciones, calculable en
        // cualquier momento (Task 5, al cerrar el período).

        // ── Evaluar transición MOROSO → ACTIVO ──
        if (contrato.estado === "MOROSO") {
          // Re-consultar los Cargo ALQUILER frescos (con las AplicacionPago
          // que los pasos 1-3 acaban de insertar en esta misma transacción)
          // — `todosCargos` quedó congelado desde antes de aplicar el pago.
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
              fecha_vencimiento: { lt: new Date() },
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
    const aplicaciones = await prisma.aplicacionPago.findMany({
      where: { cargo: { tipo: "ALQUILER" } },
      include: {
        transaccion: true,
        cargo: {
          include: {
            periodo: {
              include: { contrato: { include: { inquilino: true, propiedad: true } } },
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
