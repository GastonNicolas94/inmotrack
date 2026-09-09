import type { Prisma } from "@prisma/client";

export class IdempotencyConflictError extends Error {
  constructor(key: string) {
    super(`La operación con idempotency_key "${key}" ya fue procesada.`);
    this.name = "IdempotencyConflictError";
  }
}

export async function checkIdempotencyKey(
  tx: Prisma.TransactionClient,
  key: string
): Promise<void> {
  const existente = await tx.idempotencyKey.findUnique({ where: { key } });
  if (existente) throw new IdempotencyConflictError(key);
}

export async function persistIdempotencyKey(
  tx: Prisma.TransactionClient,
  key: string,
  responseStatus: number
): Promise<void> {
  await tx.idempotencyKey.create({
    data: { key, response_status: responseStatus },
  });
}
