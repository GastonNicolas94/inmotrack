import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { partesFechaUTC, formatFechaLocal, calcularVencimientoPeriodo, hoyEnArgentina } from "@/lib/fecha";

describe("partesFechaUTC", () => {
  test("lee año, mes y día sin corrimiento por timezone", () => {
    assert.deepEqual(partesFechaUTC("2026-09-01"), { anio: 2026, mes: 9, dia: 1 });
  });

  test("funciona igual con un objeto Date ya construido", () => {
    assert.deepEqual(partesFechaUTC(new Date("2026-01-01")), { anio: 2026, mes: 1, dia: 1 });
  });

  test("un 31 de diciembre no se corre a enero", () => {
    assert.deepEqual(partesFechaUTC("2026-12-31"), { anio: 2026, mes: 12, dia: 31 });
  });
});

describe("formatFechaLocal", () => {
  test("muestra el día correcto, no el día anterior por UTC-3", () => {
    assert.equal(formatFechaLocal("2026-09-01"), "1/9/2026");
  });
});

describe("calcularVencimientoPeriodo", () => {
  test("día 10 de un mes que no cae fin de semana, se queda igual", () => {
    // 10 de septiembre de 2026 es jueves.
    const v = calcularVencimientoPeriodo(2026, 9);
    assert.equal(v.getUTCFullYear(), 2026);
    assert.equal(v.getUTCMonth(), 8); // 0-indexed: setiembre
    assert.equal(v.getUTCDate(), 10);
  });

  test("si el 10 cae sábado, corre al lunes 12", () => {
    // 10 de octubre de 2026 es sábado.
    const v = calcularVencimientoPeriodo(2026, 10);
    assert.equal(v.getUTCDate(), 12);
    assert.equal(v.getUTCDay(), 1); // lunes
  });

  test("si el 10 cae domingo, corre al lunes 11", () => {
    // 10 de mayo de 2026 es domingo.
    const v = calcularVencimientoPeriodo(2026, 5);
    assert.equal(v.getUTCDate(), 11);
    assert.equal(v.getUTCDay(), 1); // lunes
  });

  test("el vencimiento es siempre del MISMO mes que se le pasa, nunca el siguiente", () => {
    const v = calcularVencimientoPeriodo(2026, 12);
    assert.equal(v.getUTCMonth(), 11); // 0-indexed: diciembre, no enero
  });
});

describe("hoyEnArgentina", () => {
  test("devuelve año, mes y día como números, coherentes entre sí", () => {
    const { anio, mes, dia } = hoyEnArgentina();
    assert.ok(anio >= 2026);
    assert.ok(mes >= 1 && mes <= 12);
    assert.ok(dia >= 1 && dia <= 31);
  });

  test("coincide con la fecha real de Argentina, no con la del proceso que corre el test", () => {
    const esperado = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const { anio, mes, dia } = hoyEnArgentina();
    const actual = `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    assert.equal(actual, esperado);
  });
});

describe("hoyEnArgentina — override FECHA_SIMULADA", () => {
  const originalFechaSimulada = process.env.FECHA_SIMULADA;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalFechaSimulada === undefined) delete process.env.FECHA_SIMULADA;
    else process.env.FECHA_SIMULADA = originalFechaSimulada;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  test("devuelve la fecha simulada en vez de la real cuando está seteada", () => {
    process.env.NODE_ENV = "development";
    process.env.FECHA_SIMULADA = "2026-10-15";
    assert.deepEqual(hoyEnArgentina(), { anio: 2026, mes: 10, dia: 15 });
  });

  test("tira si FECHA_SIMULADA está seteada en producción", () => {
    process.env.NODE_ENV = "production";
    process.env.FECHA_SIMULADA = "2026-10-15";
    assert.throws(() => hoyEnArgentina(), /producción/);
  });

  test("tira si el formato de FECHA_SIMULADA es inválido", () => {
    process.env.NODE_ENV = "development";
    process.env.FECHA_SIMULADA = "15/10/2026";
    assert.throws(() => hoyEnArgentina(), /formato inválido/);
  });

  test("tira si el mes o el día de FECHA_SIMULADA está fuera de rango (ej. día/mes invertidos)", () => {
    process.env.NODE_ENV = "development";
    process.env.FECHA_SIMULADA = "2026-25-08";
    assert.throws(() => hoyEnArgentina(), /fuera de rango/);
  });

  test("sin FECHA_SIMULADA seteada, devuelve la fecha real igual que antes", () => {
    delete process.env.FECHA_SIMULADA;
    process.env.NODE_ENV = "development";
    const esperado = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const { anio, mes, dia } = hoyEnArgentina();
    const actual = `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    assert.equal(actual, esperado);
  });
});
