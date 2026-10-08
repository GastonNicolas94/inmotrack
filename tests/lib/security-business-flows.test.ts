import test from "node:test";
import assert from "node:assert/strict";
import { assertAllowedTransition, LIQUIDATION_TRANSITIONS } from "../../lib/security/business-transitions.ts";
test("rejects terminal and repeated transitions", () => {
  assert.throws(() => assertAllowedTransition("PAGADA","APROBADA",LIQUIDATION_TRANSITIONS));
  assert.throws(() => assertAllowedTransition("APROBADA","APROBADA",LIQUIDATION_TRANSITIONS));
});
test("permits configured state transition", () => {
  assert.doesNotThrow(() => assertAllowedTransition("PENDIENTE","APROBADA",LIQUIDATION_TRANSITIONS));
});