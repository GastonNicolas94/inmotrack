-- CreateEnum
CREATE TYPE "EstadoCiclo" AS ENUM ('FUTURO', 'ABIERTO', 'CERRADO');

-- CreateEnum
CREATE TYPE "EstadoCobranza" AS ENUM ('PENDIENTE', 'PARCIAL', 'TOTAL', 'VENCIDO');

-- CreateEnum
CREATE TYPE "TipoCargo" AS ENUM ('ALQUILER', 'GASTO', 'PUNITORIO', 'AJUSTE');

-- DropForeignKey
ALTER TABLE "aplicaciones_pago" DROP CONSTRAINT "aplicaciones_pago_id_gasto_fkey";

-- DropForeignKey
ALTER TABLE "aplicaciones_pago" DROP CONSTRAINT "aplicaciones_pago_id_periodo_pago_fkey";

-- AlterTable
ALTER TABLE "aplicaciones_pago" DROP COLUMN "id_gasto",
DROP COLUMN "id_periodo_pago",
DROP COLUMN "tipo_aplicacion",
ADD COLUMN     "id_cargo" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "periodos_pago" DROP COLUMN "estado",
DROP COLUMN "monto_cargo",
DROP COLUMN "monto_cobrado",
DROP COLUMN "punitorios_cobrados",
DROP COLUMN "punitorios_devengados",
ADD COLUMN     "estado_ciclo" "EstadoCiclo" NOT NULL DEFAULT 'ABIERTO',
ADD COLUMN     "estado_cobranza" "EstadoCobranza" NOT NULL DEFAULT 'PENDIENTE';

-- AlterTable
ALTER TABLE "transacciones" ADD COLUMN     "monto_sin_aplicar" DECIMAL(15,2) NOT NULL DEFAULT 0.00;

-- DropEnum
DROP TYPE "EstadoPeriodo";

-- DropEnum
DROP TYPE "TipoAplicacion";

-- CreateTable
CREATE TABLE "cargos" (
    "id" SERIAL NOT NULL,
    "id_periodo" INTEGER NOT NULL,
    "id_contrato" INTEGER NOT NULL,
    "tipo" "TipoCargo" NOT NULL,
    "monto" DECIMAL(15,2) NOT NULL,
    "monto_pendiente" DECIMAL(15,2) NOT NULL,
    "descripcion" TEXT,
    "id_gasto" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cargos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cargos_id_contrato_monto_pendiente_idx" ON "cargos"("id_contrato", "monto_pendiente");

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_id_periodo_fkey" FOREIGN KEY ("id_periodo") REFERENCES "periodos_pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_id_contrato_fkey" FOREIGN KEY ("id_contrato") REFERENCES "contratos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_id_gasto_fkey" FOREIGN KEY ("id_gasto") REFERENCES "gastos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicaciones_pago" ADD CONSTRAINT "aplicaciones_pago_id_cargo_fkey" FOREIGN KEY ("id_cargo") REFERENCES "cargos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

