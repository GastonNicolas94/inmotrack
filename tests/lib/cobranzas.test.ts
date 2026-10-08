import assert from "node:assert/strict";
import test from "node:test";
import { calcularEstadoCobranza, argentinaDateOnly, conteosCobranzas, filtrarCobranzas, type FilaCobranza } from "@/lib/cobranzas";

test("liquidación de período por cargos y aplicaciones, con vencimiento", () => {
  const hoy = new Date("2026-10-07T00:00:00Z");
  const due = new Date("2026-10-06T00:00:00Z");
  assert.deepEqual(calcularEstadoCobranza("100000.00", "25000.00", due, hoy), {
    estado: "VENCIDO", pendiente: "75000.00", pagado: "25000.00",
  });
  assert.equal(calcularEstadoCobranza("100", "100", due, hoy).estado, "COBRADO");
  assert.equal(calcularEstadoCobranza("100", "0", hoy, hoy).estado, "PENDIENTE");
  assert.equal(calcularEstadoCobranza("100", "120", due, hoy).pendiente, "0.00");
  assert.equal(calcularEstadoCobranza("100", "0", new Date("2026-10-08"), hoy).estado, "PENDIENTE");
});
test("la fecha de cobranza respeta Argentina", () => {
  assert.equal(argentinaDateOnly(new Date("2026-10-07T01:00:00Z")).toISOString(), "2026-10-06T00:00:00.000Z");
});
test("contadores y pestañas corresponden a períodos y no a pagos individuales", () => {
  const demo = (id: number, estado: FilaCobranza["estado"]): FilaCobranza => ({
    id, contratoId:id, estado, inquilino:"Persona Ejemplo", propiedad:"Calle Central",
    periodo:"2026-10", vencimiento:new Date("2026-10-08"), total:"100",pagado:"0",pendiente:"100",
  });
  const data=[demo(1,"PENDIENTE"),demo(2,"VENCIDO"),demo(3,"COBRADO")];
  assert.deepEqual(conteosCobranzas(data), { todos:3,pendientes:2,vencidos:1,cobrados:1 });
  assert.deepEqual(filtrarCobranzas(data,"pendientes","central").map(x=>x.id), [1,2]);
  assert.deepEqual(filtrarCobranzas(data,"cobrados","inexistente"), []);
});
