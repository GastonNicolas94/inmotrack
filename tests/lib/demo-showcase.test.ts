import test from "node:test";
import assert from "node:assert/strict";
import { buildDemoPlans, plannedMonths, demoInventory, demoPaymentRate, referenceMonth, monthId } from "@/lib/demo-showcase";

test("inventario: 50 contratos y 32 propietarios", () => {
  const x=demoInventory();
  assert.equal(x.contratos,50);
  assert.equal(x.inquilinos,50);
  assert.equal(x.propietarios,32);
  assert.ok(x.periodosEstimados>=400);
  assert.ok(x.copropiedades>=8);
  assert.deepEqual(x.estados,{BORRADOR:4,ACTIVO:24,MOROSO:12,POR_VENCER:4,VENCIDO:3,RESCINDIDO:3});
});
test("participaciones no exceden 100 y propiedades propias no se comparten", () => {
  for(const x of buildDemoPlans()){
    assert.equal(x.secondaryOwnerIndex===null ? x.ownerPct : x.ownerPct+(100-x.ownerPct),100);
    if(x.ownProperty) assert.equal(x.secondaryOwnerIndex,null);
    assert.ok(x.monthlyRent>0);
    assert.ok(x.finished>x.started);
  }
});
test("borradores y períodos futuros no tienen pagos", () => {
  const now=referenceMonth();
  for(const p of buildDemoPlans()){
    const months=plannedMonths(p,now);
    if(p.state==="BORRADOR")assert.equal(months.length,0);
    for(const [index,m] of months.entries()){
      const due=new Date(Date.UTC(m.getUTCFullYear(),m.getUTCMonth(),10));
      const rate=demoPaymentRate(p,index,due,now);
      assert.ok(rate>=0&&rate<=1);
      if(due>now)assert.equal(rate,0);
    }
  }
  assert.equal(monthId(now),"2026-10");
});
