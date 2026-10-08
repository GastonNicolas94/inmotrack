import assert from "node:assert/strict";
import test from "node:test";
import { contractRowActionPolicy, liquidationRowActionPolicy } from "@/lib/row-action-policy";

test("Contrato activo con permisos: pagar e ingresar al menú secundario", () => {
  const p = contractRowActionPolicy("ACTIVO", true, true);
  assert.equal(p.registerPayment, true);
  assert.equal(p.calculateInterest, true);
  assert.equal(p.registerExpense, true);
  assert.equal(p.showPeriods, true);
  assert.equal(p.showAdjustments, true);
  assert.equal(p.activate, false);
});
test("Solo borradores pueden activarse, sin pago hasta tener contrato habilitado", () => {
  const p=contractRowActionPolicy("BORRADOR",true,true);
  assert.equal(p.activate,true);
  assert.equal(p.registerPayment,false);
  assert.equal(p.registerExpense,false);
});
test("Auditor mantiene lecturas, sin capacidad de escritura en contrato", () => {
  for(const estado of ["BORRADOR","ACTIVO","MOROSO","POR_VENCER","VENCIDO","RESCINDIDO"]){
    const p=contractRowActionPolicy(estado,false,true);
    assert.equal(p.showPeriods,true);
    assert.equal(p.showAdjustments,true);
    assert.equal(p.activate,false);
    assert.equal(p.registerPayment,false);
    assert.equal(p.calculateInterest,false);
    assert.equal(p.registerExpense,false);
  }
});
test("Contrato rescindido no admite pagos, cargos ni intereses", () => {
  const p=contractRowActionPolicy("RESCINDIDO",true,true);
  assert.equal(p.registerPayment,false);
  assert.equal(p.registerExpense,false);
  assert.equal(p.calculateInterest,false);
});
test("Liquidaciones: solo rol habilitado puede aprobar y ADMIN confirmar pago", () => {
  const pending=liquidationRowActionPolicy("PENDIENTE",true,false);
  assert.deepEqual(pending,{showDetail:true,approve:true,confirmPayment:false});
  const approved=liquidationRowActionPolicy("APROBADA",true,false);
  assert.deepEqual(approved,{showDetail:true,approve:false,confirmPayment:false});
  assert.equal(liquidationRowActionPolicy("APROBADA",true,true).confirmPayment,true);
  for(const state of ["PENDIENTE","APROBADA","PAGADA"]){
    const read=liquidationRowActionPolicy(state,false,false);
    assert.equal(read.showDetail,true);
    assert.equal(read.approve,false);
    assert.equal(read.confirmPayment,false);
  }
});
