import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { fechaPeriodo, requiereAjuste } from "@/lib/ajustes-contrato";

function requiere(params: {
  fechaInicio?: string;
  fechaUltimoAjuste?: string | null;
  meses?: number | null;
  indice?: "ICL" | "IPC" | "ACUERDO" | null;
  periodo: string;
}) {
  return requiereAjuste({
    fechaInicio: new Date(params.fechaInicio ?? "2026-01-01T00:00:00.000Z"),
    fechaUltimoAjuste: params.fechaUltimoAjuste ? new Date(`${params.fechaUltimoAjuste}T00:00:00.000Z`) : null,
    mesesActualizacion: params.meses ?? 3,
    indiceActualizacion: params.indice ?? "ICL",
    periodoObjetivo: params.periodo,
  });
}

describe("fechaPeriodo", () => {
  test("convierte YYYY-MM al primer día UTC del mes", () => {
    assert.equal(fechaPeriodo("2026-04").toISOString(), "2026-04-01T00:00:00.000Z");
  });

  test("rechaza períodos inválidos", () => {
    assert.throws(() => fechaPeriodo("2026-13"), /período/i);
    assert.throws(() => fechaPeriodo("abril-2026"), /período/i);
  });
});

describe("requiereAjuste", () => {
  test("contrato trimestral iniciado en enero ajusta por primera vez en abril", () => {
    assert.equal(requiere({ periodo: "2026-03" }), false);
    assert.equal(requiere({ periodo: "2026-04" }), true);
  });

  test("usa fecha_ultimo_ajuste como nueva base", () => {
    assert.equal(requiere({ fechaUltimoAjuste: "2026-04-01", periodo: "2026-06" }), false);
    assert.equal(requiere({ fechaUltimoAjuste: "2026-04-01", periodo: "2026-07" }), true);
  });

  test("soporta frecuencias de 1, 4, 6 y 12 meses", () => {
    assert.equal(requiere({ meses: 1, periodo: "2026-02" }), true);
    assert.equal(requiere({ meses: 4, periodo: "2026-05" }), true);
    assert.equal(requiere({ meses: 6, periodo: "2026-07" }), true);
    assert.equal(requiere({ meses: 12, periodo: "2027-01" }), true);
  });

  test("maneja cambio de año sin corrimientos", () => {
    assert.equal(requiere({ fechaInicio: "2026-11-01T00:00:00.000Z", meses: 3, periodo: "2027-01" }), false);
    assert.equal(requiere({ fechaInicio: "2026-11-01T00:00:00.000Z", meses: 3, periodo: "2027-02" }), true);
  });

  test("no exige ajuste si falta índice o frecuencia", () => {
    assert.equal(requiere({ indice: null, periodo: "2027-01" }), false);
    assert.equal(requiere({ meses: null, periodo: "2027-01" }), false);
  });

  test("no vuelve a pedir ajuste para un período anterior a la próxima fecha", () => {
    assert.equal(requiere({ fechaUltimoAjuste: "2026-10-01", meses: 3, periodo: "2026-09" }), false);
  });
});
