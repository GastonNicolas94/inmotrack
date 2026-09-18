import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { contratoSchema } from "@/schemas/contrato.schema";

const baseContrato = {
  id_propiedad: 1,
  id_inquilino: 1,
  fecha_inicio: "2026-01-01",
  fecha_fin: "2027-01-01",
  monto_base: 500000,
  pct_comision: 5,
  pct_punitorio_diario: 0.1,
  cobra_confeccion: false,
};

describe("contratoSchema", () => {
  test("requiere meses_act cuando se selecciona un indice de actualizacion", () => {
    const result = contratoSchema.safeParse({
      ...baseContrato,
      indice_act: "ICL",
    });

    assert.equal(result.success, false);
    if (result.success) return;
    assert.ok(result.error.issues.some((issue) => issue.path[0] === "meses_act"));
  });

  test("acepta contrato con indice y frecuencia de actualizacion", () => {
    const result = contratoSchema.safeParse({
      ...baseContrato,
      indice_act: "ICL",
      meses_act: 3,
    });

    assert.equal(result.success, true);
  });
});
