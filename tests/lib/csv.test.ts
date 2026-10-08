import assert from "node:assert/strict";
import test from "node:test";
import { generarCsv } from "@/lib/csv";

test("CSV protege fórmulas y escapa comillas", () => {
  const csv = generarCsv(["A","B"], [["=HYPERLINK(1)", 'Texto "entrecomillado"'], [" normal", "fin"]]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"\'=HYPERLINK(1)"'));
  assert.ok(csv.includes('"Texto ""entrecomillado"""'));
  assert.ok(csv.includes("\r\n"));
});
