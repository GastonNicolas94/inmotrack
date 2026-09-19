import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { propiedadSchema } from "@/schemas/propiedad.schema";

describe("propiedadSchema", () => {
  it("acepta múltiples propietarios que suman 100%", () => {
    const resultado = propiedadSchema.safeParse({
      direccion: "Av. Siempre Viva 742",
      es_propia: false,
      participaciones: [
        { id_propietario: 1, porcentaje: 60 },
        { id_propietario: 2, porcentaje: 40 },
      ],
    });

    assert.equal(resultado.success, true);
  });

  it("rechaza participaciones que no suman 100%", () => {
    const resultado = propiedadSchema.safeParse({
      direccion: "Av. Siempre Viva 742",
      es_propia: false,
      participaciones: [
        { id_propietario: 1, porcentaje: 60 },
        { id_propietario: 2, porcentaje: 30 },
      ],
    });

    assert.equal(resultado.success, false);
  });

  it("rechaza un propietario repetido", () => {
    const resultado = propiedadSchema.safeParse({
      direccion: "Av. Siempre Viva 742",
      es_propia: false,
      participaciones: [
        { id_propietario: 1, porcentaje: 50 },
        { id_propietario: 1, porcentaje: 50 },
      ],
    });

    assert.equal(resultado.success, false);
  });
});
