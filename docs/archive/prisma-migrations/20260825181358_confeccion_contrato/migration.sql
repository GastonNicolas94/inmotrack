-- CreateEnum
CREATE TYPE "EstrategiaConfeccion" AS ENUM ('UN_ALQUILER', 'PORCENTAJE_5');

-- AlterEnum
ALTER TYPE "TipoGasto" ADD VALUE 'CONFECCION_CONTRATO';

-- AlterEnum
ALTER TYPE "TipoTransaccion" ADD VALUE 'INGRESO_CONFECCION_CONTRATO';

-- AlterTable
ALTER TABLE "contratos" ADD COLUMN     "cobra_confeccion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "estrategia_confeccion" "EstrategiaConfeccion";
