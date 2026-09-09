import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "../helpers/db";
import {
  checkIdempotencyKey,
  persistIdempotencyKey,
  IdempotencyConflictError,
} from "@/lib/idempotency";

describe("idempotencia", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("no lanza si la key no existe todavía", async () => {
    await assert.doesNotReject(
      prisma.$transaction((tx) => checkIdempotencyKey(tx, "key-nueva"))
    );
  });

  it("lanza IdempotencyConflictError si la key ya fue persistida", async () => {
    await prisma.$transaction((tx) => persistIdempotencyKey(tx, "key-repetida", 201));

    await assert.rejects(
      prisma.$transaction((tx) => checkIdempotencyKey(tx, "key-repetida")),
      IdempotencyConflictError
    );
  });
});
