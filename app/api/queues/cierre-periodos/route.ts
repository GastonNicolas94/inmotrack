import { handleCallback } from "@vercel/queue";
import { CierrePeriodosService } from "@/services/cierre-periodos.service";
import type { CierrePeriodoQueueMessage } from "@/services/cierre-periodos-queue.service";

export const POST = handleCallback<CierrePeriodoQueueMessage>(async (message) => {
  const { outboxId } = message;
  if (!Number.isInteger(outboxId) || outboxId <= 0) {
    throw new Error("Mensaje de cierre de período inválido.");
  }

  await CierrePeriodosService.procesarFilaDeCola(outboxId);
});
