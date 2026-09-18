import type { Contrato, Prisma, PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/client";
import { prisma } from "@/lib/db";
import type { Clock } from "@/lib/clock";
import { AppClock } from "@/lib/app-clock";
import { fechaPeriodo } from "@/lib/ajustes-contrato";
import { traceServiceObject } from "@/lib/observability/tracing";

export type AplicarAjusteInput = {
  monto_nuevo: number;
  observacion?: string;
};

type ContratoAjustable = Pick<Contrato, "id" | "indice_act" | "monto_base">;

type AjustesContratoDependencies = {
  prisma: PrismaClient;
  clock: Clock;
};

export function createAjustesContratoService(deps: AjustesContratoDependencies) {
  return {
    async listarPorContrato(idContrato: number) {
      return deps.prisma.ajusteContrato.findMany({
        where: { id_contrato: idContrato },
        include: { usuario_aplicador: { select: { id: true, email: true } } },
        orderBy: [{ periodo_efectivo: "desc" }, { creado_en: "desc" }],
      });
    },

    async obtenerPendiente(idContrato: number) {
      return deps.prisma.ajusteContrato.findFirst({
        where: { id_contrato: idContrato, estado: "PENDIENTE" },
        orderBy: [{ periodo_efectivo: "asc" }, { id: "asc" }],
      });
    },

    async crearOReutilizarPendiente(
      tx: Prisma.TransactionClient,
      contrato: ContratoAjustable,
      periodoEfectivo: string,
    ) {
      if (!contrato.indice_act) {
        throw new Error("El contrato no tiene índice de actualización configurado.");
      }

      const creadoEn = await deps.clock.now();
      return tx.ajusteContrato.upsert({
        where: {
          id_contrato_periodo_efectivo: {
            id_contrato: contrato.id,
            periodo_efectivo: periodoEfectivo,
          },
        },
        update: {},
        create: {
          id_contrato: contrato.id,
          periodo_efectivo: periodoEfectivo,
          indice: contrato.indice_act,
          monto_anterior: new Decimal(contrato.monto_base),
          estado: "PENDIENTE",
          creado_en: creadoEn,
        },
      });
    },

    async aplicar(
      idContrato: number,
      idAjuste: number,
      data: AplicarAjusteInput,
      idUsuarioAplicador: number,
    ) {
      if (!Number.isFinite(data.monto_nuevo) || data.monto_nuevo <= 0) {
        throw new Error("El nuevo monto debe ser mayor a 0.");
      }

      const aplicadoEn = await deps.clock.now();
      return deps.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: number }>>`
          SELECT id FROM ajustes_contrato
          WHERE id = ${idAjuste} AND id_contrato = ${idContrato}
          FOR UPDATE
        `;
        if (locked.length === 0) throw new Error("El ajuste no existe para este contrato.");

        const contratosLocked = await tx.$queryRaw<Array<{ id: number }>>`
          SELECT id FROM contratos WHERE id = ${idContrato} FOR UPDATE
        `;
        if (contratosLocked.length === 0) throw new Error("El contrato no existe.");

        const ajuste = await tx.ajusteContrato.findUniqueOrThrow({ where: { id: idAjuste } });
        if (ajuste.estado !== "PENDIENTE") throw new Error("El ajuste ya fue aplicado.");

        const nuevoMonto = new Decimal(data.monto_nuevo);
        const fechaUltimoAjuste = fechaPeriodo(ajuste.periodo_efectivo);

        const contratoActualizado = await tx.contrato.update({
          where: { id: idContrato },
          data: { monto_base: nuevoMonto, fecha_ultimo_ajuste: fechaUltimoAjuste },
        });

        const ajusteAplicado = await tx.ajusteContrato.update({
          where: { id: idAjuste },
          data: {
            monto_nuevo: nuevoMonto,
            observacion: data.observacion?.trim() || null,
            estado: "APLICADO",
            aplicado_en: aplicadoEn,
            id_usuario_aplicador: idUsuarioAplicador,
          },
          include: { usuario_aplicador: { select: { id: true, email: true } } },
        });

        const yaPendiente = await tx.outboxCierrePeriodo.findFirst({
          where: { id_contrato: idContrato, estado: "PENDIENTE" },
          select: { id: true },
        });
        const outbox = yaPendiente ?? await tx.outboxCierrePeriodo.create({
          data: { id_contrato: idContrato, estado: "PENDIENTE", creado_en: aplicadoEn },
          select: { id: true },
        });

        return { contrato: contratoActualizado, ajuste: ajusteAplicado, outboxId: outbox.id };
      });
    },
  };
}

export const AjustesContratoService = traceServiceObject("AjustesContratoService", createAjustesContratoService({ prisma, clock: AppClock }));
