-- AlterEnum
ALTER TYPE "TipoTransaccion" ADD VALUE 'EGRESO_ADELANTO';

-- DropForeignKey
ALTER TABLE "aplicaciones_pago" DROP CONSTRAINT "aplicaciones_pago_id_liquidacion_fkey";

-- DropForeignKey
ALTER TABLE "gastos" DROP CONSTRAINT "gastos_id_liquidacion_fkey";

-- DropForeignKey
ALTER TABLE "liquidaciones_items" DROP CONSTRAINT "liquidaciones_items_id_contrato_fkey";

-- AlterTable
ALTER TABLE "aplicaciones_pago" DROP COLUMN "id_liquidacion",
ADD COLUMN     "id_liquidacion_item" INTEGER;

-- AlterTable
ALTER TABLE "gastos" DROP COLUMN "id_liquidacion",
ADD COLUMN     "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "id_liquidacion_item" INTEGER;

-- AlterTable
ALTER TABLE "liquidaciones" ADD COLUMN     "adelantos_descontados" DECIMAL(15,2) NOT NULL DEFAULT 0,
ADD COLUMN     "fecha_desde" DATE NOT NULL,
ADD COLUMN     "fecha_hasta" DATE NOT NULL;

-- AlterTable
ALTER TABLE "liquidaciones_items" DROP COLUMN "id_contrato",
ADD COLUMN     "id_periodo" INTEGER,
ADD COLUMN     "id_propiedad" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "transacciones" ADD COLUMN     "id_propietario" INTEGER;

-- CreateTable
CREATE TABLE "deducciones_adelanto" (
    "id" SERIAL NOT NULL,
    "id_transaccion" INTEGER NOT NULL,
    "id_liquidacion" INTEGER NOT NULL,
    "monto_descontado" DECIMAL(15,2) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deducciones_adelanto_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_id_liquidacion_item_fkey" FOREIGN KEY ("id_liquidacion_item") REFERENCES "liquidaciones_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_id_propietario_fkey" FOREIGN KEY ("id_propietario") REFERENCES "propietarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicaciones_pago" ADD CONSTRAINT "aplicaciones_pago_id_liquidacion_item_fkey" FOREIGN KEY ("id_liquidacion_item") REFERENCES "liquidaciones_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones_items" ADD CONSTRAINT "liquidaciones_items_id_periodo_fkey" FOREIGN KEY ("id_periodo") REFERENCES "periodos_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones_items" ADD CONSTRAINT "liquidaciones_items_id_propiedad_fkey" FOREIGN KEY ("id_propiedad") REFERENCES "propiedades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deducciones_adelanto" ADD CONSTRAINT "deducciones_adelanto_id_transaccion_fkey" FOREIGN KEY ("id_transaccion") REFERENCES "transacciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deducciones_adelanto" ADD CONSTRAINT "deducciones_adelanto_id_liquidacion_fkey" FOREIGN KEY ("id_liquidacion") REFERENCES "liquidaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Clean data as per spec 2.3 (grano de LiquidacionItem cambió)
TRUNCATE TABLE liquidaciones_items, liquidaciones RESTART IDENTITY CASCADE;
