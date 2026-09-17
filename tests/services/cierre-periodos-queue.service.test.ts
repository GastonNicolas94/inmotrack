import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createCierrePeriodosQueueService } from "@/services/cierre-periodos-queue.service";
import type { send } from "@vercel/queue";

describe("CierrePeriodosQueueService", () => {
  it("publica el outboxId exacto con una clave idempotente estable", async () => {
    const llamadas: Array<{ topic: string; payload: unknown; options: unknown }> = [];
    const fakeSend = (async (topic: string, payload: unknown, options: unknown) => {
      llamadas.push({ topic, payload, options });
      return { messageId: "msg-1" };
    }) as typeof send;

    const service = createCierrePeriodosQueueService({ send: fakeSend });
    const resultado = await service.publicar(42);

    assert.deepEqual(resultado, { messageId: "msg-1" });
    assert.deepEqual(llamadas, [
      {
        topic: "cierre-periodos",
        payload: { outboxId: 42 },
        options: { idempotencyKey: "cierre-periodo:42" },
      },
    ]);
  });

  it("rechaza ids de outbox inválidos sin publicar", async () => {
    let llamadas = 0;
    const fakeSend = (async () => {
      llamadas++;
      return { messageId: "msg-1" };
    }) as typeof send;

    const service = createCierrePeriodosQueueService({ send: fakeSend });

    await assert.rejects(() => service.publicar(0), /outboxId inválido/);
    assert.equal(llamadas, 0);
  });
});
