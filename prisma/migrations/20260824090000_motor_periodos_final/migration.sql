-- DropIndex
DROP INDEX "cargos_id_contrato_monto_pendiente_idx";

-- AlterTable
ALTER TABLE "cargos" DROP COLUMN "monto_pendiente";

-- AlterTable
ALTER TABLE "periodos_pago" DROP COLUMN "estado_cobranza",
ADD COLUMN     "credito_al_cierre" DECIMAL(15,2),
ADD COLUMN     "credito_heredado" DECIMAL(15,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "transacciones" DROP COLUMN "monto_sin_aplicar";

-- DropEnum
DROP TYPE "EstadoCobranza";

-- CreateIndex
CREATE INDEX "cargos_id_contrato_idx" ON "cargos"("id_contrato");

