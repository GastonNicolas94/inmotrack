import test from "node:test";
import assert from "node:assert/strict";
import { chooseSqlIdentifier, chooseSortDirection } from "../../lib/security/sql-identifiers.ts";
test("blocks unsafe SQL identifiers and sorting",()=>{
 assert.throws(()=>chooseSqlIdentifier("id; DROP TABLE contratos",["id","fecha_inicio"]));
 assert.throws(()=>chooseSortDirection("DESC; DELETE FROM contratos"));
 assert.equal(chooseSqlIdentifier("id",["id","fecha_inicio"]),"id");
 assert.equal(chooseSortDirection("desc"),"DESC");
});
