import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { handleServiceError } from "../../lib/api-error-handler.ts";
import { IdempotencyConflictError } from "../../lib/idempotency.ts";
import { HttpError } from "../../lib/http-error.ts";

async function body(response: Response) {
  return response.json();
}

test("maps HttpError before all generic handlers", async () => {
  const response = handleServiceError(new HttpError("FORBIDDEN", "Acceso denegado.", 403));
  assert.equal(response.status, 403);
  assert.deepEqual(await body(response), {
    error_code: "FORBIDDEN",
    message: "Acceso denegado.",
  });
});

test("maps idempotency conflicts to 409", async () => {
  const response = handleServiceError(new IdempotencyConflictError("key-1"));
  assert.equal(response.status, 409);
  assert.equal((await body(response)).error_code, "IDEMPOTENCY_CONFLICT");
});

test("maps Prisma missing records to 404", async () => {
  const response = handleServiceError(
    new Prisma.PrismaClientKnownRequestError("missing", {
      code: "P2025",
      clientVersion: "test",
    }),
  );
  assert.equal(response.status, 404);
  assert.equal((await body(response)).error_code, "NOT_FOUND");
});

test("maps technical Prisma errors to 500 without exposing database details", async () => {
  const response = handleServiceError(
    new Prisma.PrismaClientKnownRequestError("relation public.secret_table does not exist", {
      code: "P2021",
      clientVersion: "test",
    }),
  );
  assert.equal(response.status, 500);
  assert.deepEqual(await body(response), {
    error_code: "SERVER_ERROR",
    message: "Error interno del servidor.",
  });
});

test("maps other errors to business violations", async () => {
  const response = handleServiceError(new Error("invalid state"));
  assert.equal(response.status, 400);
  assert.deepEqual(await body(response), {
    error_code: "BUSINESS_RULE_VIOLATION",
    message: "invalid state",
  });
});

test("maps non-Error throws to generic server errors", async () => {
  const response = handleServiceError("broken");
  assert.equal(response.status, 500);
  assert.deepEqual(await body(response), {
    error_code: "SERVER_ERROR",
    message: "Error interno del servidor.",
  });
});
