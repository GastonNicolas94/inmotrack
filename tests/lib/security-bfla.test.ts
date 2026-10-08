import test from "node:test";
import assert from "node:assert/strict";
import { requirePermission } from "../../lib/security/function-authorization.ts";
import type { AuthenticatedUser } from "../../lib/auth-context.ts";
const user = (rol: AuthenticatedUser["rol"], approved = false): AuthenticatedUser => ({id:1,authUserId:"x",email:"a@b.com",rol,puedeAprobarLiquidaciones:approved,idPropietario:null});
test("auditor cannot write or manage users", () => {
  assert.throws(() => requirePermission(user("AUDITOR"), "contracts:write"));
  assert.throws(() => requirePermission(user("AUDITOR"), "users:manage"));
  assert.doesNotThrow(() => requirePermission(user("AUDITOR"), "reports:read"));
});
test("delegated approval does not grant user management", () => {
  assert.doesNotThrow(() => requirePermission(user("EMPLEADO",true), "liquidations:approve"));
  assert.throws(() => requirePermission(user("EMPLEADO",true), "users:manage"));
});
