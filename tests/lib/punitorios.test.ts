import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Decimal } from "@prisma/client/runtime/client";
import { calcularInteresAcumulado } from "@/lib/punitorios";

describe("calcularInteresAcumulado", () => {
  test("un solo día, sin aplicaciones: monto × tasa/100", () => {
    const resultado = calcularInteresAcumulado(
      new Decimal(300000),
      [],
      new Date(Date.UTC(2026, 7, 1)),
      new Date(Date.UTC(2026, 7, 1)),
      new Decimal(1)
    );
    assert.equal(resultado.toNumber(), 3000); // 300.000 * 1% = 3.000
  });

  test("varios días, sin aplicaciones: monto × tasa/100 × cantidad de días", () => {
    // Del 1/8 al 5/8 inclusive = 5 días.
    const resultado = calcularInteresAcumulado(
      new Decimal(300000),
      [],
      new Date(Date.UTC(2026, 7, 1)),
      new Date(Date.UTC(2026, 7, 5)),
      new Decimal(1)
    );
    assert.equal(resultado.toNumber(), 15000); // 3.000 * 5 días
  });

  test("un pago total ANTES del rango: interés total es 0 (pendiente ya era 0 todo el rango)", () => {
    const resultado = calcularInteresAcumulado(
      new Decimal(300000),
      [
        {
          monto_aplicado: new Decimal(300000),
          transaccion: { fecha_transaccion: new Date(Date.UTC(2026, 6, 31, 12)) }, // 31/7, antes del rango
        },
      ],
      new Date(Date.UTC(2026, 7, 1)),
      new Date(Date.UTC(2026, 7, 5)),
      new Decimal(1)
    );
    assert.equal(resultado.toNumber(), 0);
  });

  test("un pago parcial A MITAD del rango: los días antes usan el monto completo, los de después el reducido", () => {
    // Rango 1/8 al 5/8 (5 días). El 3/8 se paga 100.000 → pendiente pasa de
    // 300.000 a 200.000 desde ESE mismo día (inclusive).
    // Días 1,2 (2 días) a 300.000 * 1% = 3.000 c/u = 6.000
    // Días 3,4,5 (3 días) a 200.000 * 1% = 2.000 c/u = 6.000
    // Total esperado: 12.000
    const resultado = calcularInteresAcumulado(
      new Decimal(300000),
      [
        {
          monto_aplicado: new Decimal(100000),
          transaccion: { fecha_transaccion: new Date(Date.UTC(2026, 7, 3, 15)) }, // 3/8, 15hs UTC
        },
      ],
      new Date(Date.UTC(2026, 7, 1)),
      new Date(Date.UTC(2026, 7, 5)),
      new Decimal(1)
    );
    assert.equal(resultado.toNumber(), 12000);
  });

  test("dos pagos parciales en distintos días del rango, cada uno reduce la base desde su propio día", () => {
    // Rango 1/8 al 4/8 (4 días).
    // Día 1: pendiente 300.000 → interés 3.000
    // Día 2: se paga 50.000 (mismo día) → pendiente 250.000 → interés 2.500
    // Día 3: pendiente sigue 250.000 → interés 2.500
    // Día 4: se paga 100.000 más (mismo día) → pendiente 150.000 → interés 1.500
    // Total: 3.000 + 2.500 + 2.500 + 1.500 = 9.500
    const resultado = calcularInteresAcumulado(
      new Decimal(300000),
      [
        {
          monto_aplicado: new Decimal(50000),
          transaccion: { fecha_transaccion: new Date(Date.UTC(2026, 7, 2, 9)) },
        },
        {
          monto_aplicado: new Decimal(100000),
          transaccion: { fecha_transaccion: new Date(Date.UTC(2026, 7, 4, 9)) },
        },
      ],
      new Date(Date.UTC(2026, 7, 1)),
      new Date(Date.UTC(2026, 7, 4)),
      new Decimal(1)
    );
    assert.equal(resultado.toNumber(), 9500);
  });

  test("respeta una tasa diaria distinta a 1%", () => {
    const resultado = calcularInteresAcumulado(
      new Decimal(100000),
      [],
      new Date(Date.UTC(2026, 7, 1)),
      new Date(Date.UTC(2026, 7, 1)),
      new Decimal(0.5)
    );
    assert.equal(resultado.toNumber(), 500); // 100.000 * 0.5%
  });
});
