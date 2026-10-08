import test from "node:test";
import assert from "node:assert/strict";
import { contratoSchema } from "../../schemas/contrato.schema.ts";

const valid = {
  id_propiedad: 1, id_inquilino: 2,
  fecha_inicio: "2026-01-01", fecha_fin: "2027-01-01",
  monto_base: 100000, pct_comision: 10, pct_punitorio_diario: 0.1,
};

test("contract DTO rejects unexpected internal fields", () => {
  assert.equal(contratoSchema.safeParse(valid).success, true);
  for (const field of ["id", "estado", "id_propietario", "rol", "inmobiliariaId"]) {
    assert.equal(contratoSchema.safeParse({ ...valid, [field]: 999 }).success, false, field);
  }
});
