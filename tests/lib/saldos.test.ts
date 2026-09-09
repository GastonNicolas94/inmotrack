import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { calcularPendiente } from "@/lib/saldos";

describe("calcularPendiente", () => {
  test("sin aplicaciones, el pendiente es el monto completo", () => {
    assert.equal(calcularPendiente(600000, []).toString(), "600000");
  });

  test("resta una aplicación parcial", () => {
    assert.equal(
      calcularPendiente(600000, [{ monto_aplicado: 400000 }]).toString(),
      "200000"
    );
  });

  test("resta varias aplicaciones hasta dejarlo en cero", () => {
    assert.equal(
      calcularPendiente(600000, [{ monto_aplicado: 400000 }, { monto_aplicado: 200000 }]).toString(),
      "0"
    );
  });

  test("da negativo si las aplicaciones superan el monto (sobrante)", () => {
    assert.equal(
      calcularPendiente(600000, [{ monto_aplicado: 700000 }]).toString(),
      "-100000"
    );
  });

  test("acepta Decimal, string o number indistintamente", () => {
    assert.equal(
      calcularPendiente("600000.00", [{ monto_aplicado: "150000.50" }]).toString(),
      "449999.5"
    );
  });
});
