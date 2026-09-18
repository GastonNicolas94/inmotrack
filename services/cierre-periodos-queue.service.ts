import { send } from "@vercel/queue";

export const CIERRE_PERIODOS_TOPIC = "cierre-periodos";

export type CierrePeriodoQueueMessage = {
  outboxId: number;
};

type SendFn = typeof send;

type Dependencies = {
  send: SendFn;
};

export function createCierrePeriodosQueueService(deps: Dependencies) {
  return {
    async publicar(outboxId: number) {
      if (!Number.isInteger(outboxId) || outboxId <= 0) {
        throw new Error("outboxId inválido.");
      }

      return deps.send<CierrePeriodoQueueMessage>(
        CIERRE_PERIODOS_TOPIC,
        { outboxId },
        { idempotencyKey: `cierre-periodo:${outboxId}` },
      );
    },
  };
}

export const CierrePeriodosQueueService = createCierrePeriodosQueueService({ send });
