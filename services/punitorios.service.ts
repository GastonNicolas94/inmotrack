// services/punitorios.service.ts
import { Decimal } from "@prisma/client/runtime/client";
import { prisma } from "@/lib/db";
import { calcularPendiente } from "@/lib/saldos";
import { calcularInteresAcumulado } from "@/lib/punitorios";
import { hoyEnArgentina, formatFechaLocal } from "@/lib/fecha";

export const PunitoriosService = {
  /**
   * Calcula y persiste el interés acumulado de cada Cargo seleccionado,
   * desde la última corrida (o desde el día 1 de su período, si es la
   * primera vez) hasta hoy — un único Cargo PUNITORIO por cargo de
   * origen, nunca uno por día (ver spec, sección 2.5). Es una acción de
   * usuario puntual, no un job de fondo: si `ids_cargo` incluye un Cargo
   * que no corresponde a este contrato, ya es PUNITORIO, o no tiene
   * deuda pendiente, simplemente se lo saltea sin generar nada — no es
   * un error.
   */
  async calcularIntereses(id_contrato: number, ids_cargo: number[], id_usuario_creador: number) {
    const { anio, mes, dia } = hoyEnArgentina();
    const hoy = new Date(Date.UTC(anio, mes - 1, dia));

    let generados = 0;
    let montoTotal = new Decimal(0);

    for (const id_cargo of ids_cargo) {
      const nuevoCargo = await prisma.$transaction(async (tx) => {
        // Lock pesimista sobre el Cargo de origen: serializa dos llamados
        // concurrentes sobre el mismo cargo (no hay cola de fondo acá, es
        // correcto que uno espere al otro en vez de saltearlo).
        await tx.$queryRawUnsafe(`SELECT id FROM cargos WHERE id = $1 FOR UPDATE`, id_cargo);

        const cargo = await tx.cargo.findUnique({
          where: { id: id_cargo },
          include: {
            aplicaciones: { include: { transaccion: { select: { fecha_transaccion: true } } } },
            periodo: { select: { periodo: true } },
            contrato: { select: { pct_punitorio_diario: true } },
            punitorios: {
              orderBy: { fecha_punitorio_hasta: "desc" },
              take: 1,
              select: { fecha_punitorio_hasta: true },
            },
          },
        });

        if (!cargo || cargo.id_contrato !== id_contrato || cargo.tipo === "PUNITORIO") {
          return null;
        }

        // El Cargo PUNITORIO es un hecho nuevo (se calcula hoy, aunque
        // esté basado en deuda vieja) — va al período ABIERTO actual del
        // contrato, nunca al período del cargo de origen (que puede estar
        // CERRADO hace rato). Mismo criterio que el Cargo AJUSTE que nace
        // de un contra-asiento sobre un período cerrado.
        const periodoAbierto = await tx.periodoPago.findFirst({
          where: { id_contrato: cargo.id_contrato, estado_ciclo: "ABIERTO" },
        });
        if (!periodoAbierto) return null; // no debería pasar — invariante del sistema

        const pendiente = calcularPendiente(cargo.monto, cargo.aplicaciones);
        if (pendiente.lessThanOrEqualTo(0)) return null;

        let desde: Date;
        const ultimaHasta = cargo.punitorios[0]?.fecha_punitorio_hasta;
        if (ultimaHasta) {
          desde = new Date(
            Date.UTC(ultimaHasta.getUTCFullYear(), ultimaHasta.getUTCMonth(), ultimaHasta.getUTCDate() + 1)
          );
        } else {
          const [anioPeriodo, mesPeriodo] = cargo.periodo.periodo.split("-").map(Number);
          desde = new Date(Date.UTC(anioPeriodo, mesPeriodo - 1, 1));
        }

        // Ya se calculó hasta hoy en una corrida anterior el mismo día —
        // no hay ningún hueco que completar.
        if (desde.getTime() > hoy.getTime()) return null;

        const monto = calcularInteresAcumulado(
          cargo.monto,
          cargo.aplicaciones,
          desde,
          hoy,
          cargo.contrato.pct_punitorio_diario
        );

        return tx.cargo.create({
          data: {
            id_periodo: periodoAbierto.id,
            id_contrato: cargo.id_contrato,
            tipo: "PUNITORIO",
            monto,
            id_cargo_origen: cargo.id,
            fecha_punitorio_desde: desde,
            fecha_punitorio_hasta: hoy,
            descripcion: `Intereses ${formatFechaLocal(desde)} al ${formatFechaLocal(hoy)}`,
          },
        });
      });

      if (nuevoCargo) {
        generados++;
        montoTotal = montoTotal.plus(nuevoCargo.monto);
      }
    }

    return { generados, monto_total: montoTotal };
  },
};
