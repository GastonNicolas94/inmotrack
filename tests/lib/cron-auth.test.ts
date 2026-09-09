import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { validarCronSecret } from "@/lib/cron-auth";

describe("validarCronSecret", () => {
  const originalEnv = process.env.CRON_SECRET;

  before(() => {
    process.env.CRON_SECRET = "un-secreto-de-prueba";
  });
  after(() => {
    process.env.CRON_SECRET = originalEnv;
  });

  test("acepta el header Authorization correcto", () => {
    const req = new Request("http://localhost/api/v1/cron/activar-cierre-periodos", {
      headers: { Authorization: "Bearer un-secreto-de-prueba" },
    });
    assert.equal(validarCronSecret(req), true);
  });

  test("rechaza sin header Authorization", () => {
    const req = new Request("http://localhost/api/v1/cron/activar-cierre-periodos");
    assert.equal(validarCronSecret(req), false);
  });

  test("rechaza con el secret equivocado", () => {
    const req = new Request("http://localhost/api/v1/cron/activar-cierre-periodos", {
      headers: { Authorization: "Bearer otro-valor" },
    });
    assert.equal(validarCronSecret(req), false);
  });
});
