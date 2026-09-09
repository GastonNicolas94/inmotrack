-- DropForeignKey
ALTER TABLE "depositos_garantia" DROP CONSTRAINT "depositos_garantia_id_contrato_fkey";

-- DropForeignKey
ALTER TABLE "depositos_garantia" DROP CONSTRAINT "depositos_garantia_id_usuario_autorizante_fkey";

-- DropForeignKey
ALTER TABLE "gastos" DROP CONSTRAINT "gastos_id_contrato_fkey";

-- DropForeignKey
ALTER TABLE "liquidaciones" DROP CONSTRAINT "liquidaciones_id_propietario_fkey";

-- DropForeignKey
ALTER TABLE "liquidaciones_items" DROP CONSTRAINT "liquidaciones_items_id_contrato_fkey";

-- DropForeignKey
ALTER TABLE "liquidaciones_items" DROP CONSTRAINT "liquidaciones_items_id_liquidacion_fkey";

-- DropForeignKey
ALTER TABLE "transacciones" DROP CONSTRAINT "transacciones_id_contrato_fkey";

-- DropForeignKey
ALTER TABLE "transacciones" DROP CONSTRAINT "transacciones_id_txn_origen_fkey";

-- DropForeignKey
ALTER TABLE "transacciones" DROP CONSTRAINT "transacciones_id_usuario_creador_fkey";

-- DropTable
DROP TABLE "depositos_garantia";

-- DropTable
DROP TABLE "gastos";

-- DropTable
DROP TABLE "idempotency_keys";

-- DropTable
DROP TABLE "liquidaciones";

-- DropTable
DROP TABLE "liquidaciones_items";

-- DropTable
DROP TABLE "transacciones";

-- DropEnum
DROP TYPE "CajaDestino";

-- DropEnum
DROP TYPE "CargoA";

-- DropEnum
DROP TYPE "EstadoDeposito";

-- DropEnum
DROP TYPE "EstadoGasto";

-- DropEnum
DROP TYPE "EstadoLiquidacion";

-- DropEnum
DROP TYPE "TipoGasto";

-- DropEnum
DROP TYPE "TipoTransaccion";

