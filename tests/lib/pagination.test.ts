import assert from "node:assert/strict";
import test from "node:test";
import { paginate } from "../../lib/pagination.ts";

test("recorre todos los resultados sin repetir ni perder filas", () => {
  const rows = Array.from({ length: 53 }, (_, i) => i);
  const pages = [1, 2, 3].flatMap((page) => paginate(rows, page, 20).items);
  assert.deepEqual(pages, rows);
  assert.equal(paginate(rows, 3, 20).from, 41);
  assert.equal(paginate(rows, 3, 20).to, 53);
});
test("filtra antes de paginar y ajusta la página al disminuir resultados", () => {
  const rows = Array.from({ length: 53 }, (_, i) => `Registro ${i}`);
  const result = paginate(rows, 3, 20, "registro 52", rows);
  assert.deepEqual(result.items, ["Registro 52"]);
  assert.equal(result.page, 1);
  assert.equal(result.total, 1);
});
test("vacíos y cambios de tamaño mantienen rangos válidos", () => {
  assert.equal(paginate([], 2, 20).from, 0);
  assert.equal(paginate([], 2, 20).to, 0);
  assert.equal(paginate([1, 2], -1, 10).page, 1);
  assert.equal(paginate(Array.from({ length: 53 }), 2, 50).items.length, 3);
});
