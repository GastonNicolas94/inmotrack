import { handleCallback } from "@vercel/queue";
import { CierrePeriodosService } from "@/services/cierre-periodos.service";
import type { CierrePeriodoQueueMessage } from "@/services/cierre-periodos-queue.service";
import { logger } from "@/lib/observability/logger";

export const POST = handleCallback<CierrePeriodoQueueMessage>(async (message) => {
  const { outboxId } = message;
  if (!Number.isInteger(outboxId) || outboxId <= 0) {
    logger.error("queue.message.invalid", { outboxId });
    throw new Error("Mensaje de cierre de período inválido.");
  }

  try {
    await CierrePeriodosService.procesarFilaDeCola(outboxId);
  } catch (error) {
    logger.error("queue.processing.failed", {
      outboxId,
      error: error instanceof Error
        ? { name: error.name, message: error.message }
        : { message: String(error) },
    });
    throw error;
  }
});
