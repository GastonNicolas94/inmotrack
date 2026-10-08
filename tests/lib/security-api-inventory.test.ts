import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
test("API inventory script enumerates route files",()=>{
 const rows=JSON.parse(execFileSync(process.execPath,["scripts/security-api-inventory.mjs"],{encoding:"utf8"}));
 assert.ok(rows.length>0);
 assert.ok(rows.every((row:{endpoint:string})=>row.endpoint.startsWith("/api/")));
});
