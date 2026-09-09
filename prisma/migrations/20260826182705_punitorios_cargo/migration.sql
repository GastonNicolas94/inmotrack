-- AlterTable
ALTER TABLE "cargos" ADD COLUMN     "fecha_punitorio_desde" DATE,
ADD COLUMN     "fecha_punitorio_hasta" DATE,
ADD COLUMN     "id_cargo_origen" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "cargos_id_cargo_origen_fecha_punitorio_desde_key" ON "cargos"("id_cargo_origen", "fecha_punitorio_desde");

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_id_cargo_origen_fkey" FOREIGN KEY ("id_cargo_origen") REFERENCES "cargos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
