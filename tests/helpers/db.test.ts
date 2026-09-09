import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { cleanDatabase } from "./db";

describe("cleanDatabase", () => {
  it("deja la tabla de propietarios en cero después de crear una fila", async () => {
    await cleanDatabase();
    await prisma.propietario.create({
      data: { nombre: "Test", cbu: "0000000000000000000000" },
    });
    await cleanDatabase();
    const count = await prisma.propietario.count();
    assert.equal(count, 0);
  });
});
