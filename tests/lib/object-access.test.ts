import test from "node:test";
import assert from "node:assert/strict";
import { assertOwnerObjectAccess } from "../../lib/security/object-access.ts";
import { HttpError } from "../../lib/http-error.ts";

test("scoped owner can access own object", () => {
  assert.doesNotThrow(() => assertOwnerObjectAccess({ idPropietario: 15 }, 15));
});

test("scoped owner cannot access another object's ID", () => {
  assert.throws(
    () => assertOwnerObjectAccess({ idPropietario: 15 }, 16),
    (error: unknown) => error instanceof HttpError && error.status === 404,
  );
});

test("invalid IDs are rejected for all roles", () => {
  for (const id of [0, -1, NaN, Infinity, 1.5]) {
    assert.throws(
      () => assertOwnerObjectAccess({ idPropietario: null }, id),
      (error: unknown) => error instanceof HttpError && error.status === 404,
    );
  }
});

test("unscoped internal user may access any valid owner", () => {
  assert.doesNotThrow(() => assertOwnerObjectAccess({ idPropietario: null }, 16));
});
