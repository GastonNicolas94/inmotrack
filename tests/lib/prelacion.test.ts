import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { simularPrelacion } from "@/lib/prelacion";

describe("simularPrelacion", () => {
  test("un monto que cubre todo, sin sobrante, contra un solo Cargo", () => {
    const resultado = simularPrelacion(
      [{ id: 1, tipo: "ALQUILER", pendiente: 380000 }],
      380000
    );
    assert.equal(resultado.length, 1);
    assert.equal(resultado[0].id_cargo, 1);
    assert.equal(resultado[0].monto_aplicado.toString(), "380000");
  });

  test("punitorios siempre primero, aunque el Cargo de alquiler sea más viejo", () => {
    const resultado = simularPrelacion(
      [
        { id: 1, tipo: "ALQUILER", pendiente: 100000 },
        { id: 2, tipo: "PUNITORIO", pendiente: 5000 },
      ],
      10000
    );
    assert.deepEqual(
      resultado.map((a) => a.id_cargo),
      [2, 1]
    );
    assert.equal(resultado[0].monto_aplicado.toString(), "5000");
    assert.equal(resultado[1].monto_aplicado.toString(), "5000");
  });

  test("gastos solo se cubren después de agotar alquiler/ajuste", () => {
    const resultado = simularPrelacion(
      [
        { id: 1, tipo: "ALQUILER", pendiente: 380000 },
        { id: 2, tipo: "GASTO", pendiente: 30000 },
      ],
      390000
    );
    assert.deepEqual(
      resultado.map((a) => a.id_cargo),
      [1, 2]
    );
    assert.equal(resultado[0].monto_aplicado.toString(), "380000");
    assert.equal(resultado[1].monto_aplicado.toString(), "10000");
  });

  test("más viejo primero dentro del mismo tipo", () => {
    const resultado = simularPrelacion(
      [
        { id: 1, tipo: "ALQUILER", pendiente: 100000 },
        { id: 2, tipo: "ALQUILER", pendiente: 100000 },
      ],
      150000
    );
    assert.deepEqual(
      resultado.map((a) => a.id_cargo),
      [1, 2]
    );
    assert.equal(resultado[0].monto_aplicado.toString(), "100000");
    assert.equal(resultado[1].monto_aplicado.toString(), "50000");
  });

  test("si el monto no alcanza para nada del primer Cargo, no genera ninguna aplicación", () => {
    const resultado = simularPrelacion([{ id: 1, tipo: "ALQUILER", pendiente: 100000 }], 0);
    assert.equal(resultado.length, 0);
  });

  test("ignora Cargo ya cubiertos (pendiente <= 0)", () => {
    const resultado = simularPrelacion(
      [
        { id: 1, tipo: "ALQUILER", pendiente: 0 },
        { id: 2, tipo: "ALQUILER", pendiente: 50000 },
      ],
      50000
    );
    assert.equal(resultado.length, 1);
    assert.equal(resultado[0].id_cargo, 2);
  });

  test("un monto de más queda sin aplicar del todo (sobrante no modelado acá)", () => {
    const resultado = simularPrelacion([{ id: 1, tipo: "ALQUILER", pendiente: 100000 }], 150000);
    assert.equal(resultado.length, 1);
    assert.equal(resultado[0].monto_aplicado.toString(), "100000");
  });
});
