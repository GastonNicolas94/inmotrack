-- CreateEnum
CREATE TYPE "TipoTransaccion" AS ENUM ('INGRESO_COBRO', 'INGRESO_COMISION', 'INGRESO_PUNITORIO', 'INGRESO_ALQUILER_PROPIO', 'EGRESO_LIQUIDACION', 'EGRESO_TERCEROS', 'EGRESO_OPERATIVO', 'CONTRA_ASIENTO');

-- CreateEnum
CREATE TYPE "CajaDestino" AS ENUM ('TERCEROS', 'OPERATIVA');

-- CreateEnum
CREATE TYPE "TipoAplicacion" AS ENUM ('CAPITAL', 'PUNITORIO', 'GASTO');

-- CreateEnum
CREATE TYPE "CargoA" AS ENUM ('INQUILINO', 'PROPIETARIO', 'INMOBILIARIA');

-- CreateEnum
CREATE TYPE "TipoGasto" AS ENUM ('ARREGLO', 'EXPENSA', 'GAS', 'LUZ', 'IMPUESTO', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoGasto" AS ENUM ('PENDIENTE', 'PAGADO_PROVEEDOR');

-- CreateEnum
CREATE TYPE "EstadoLiquidacion" AS ENUM ('PENDIENTE', 'APROBADA', 'PAGADA');

-- AlterTable
ALTER TABLE "contratos" ADD COLUMN     "fecha_ultimo_ajuste" DATE;

-- AlterTable
ALTER TABLE "periodos_pago" ADD COLUMN     "punitorios_cobrados" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "punitorios_devengados" DECIMAL(15,2) NOT NULL DEFAULT 0.00;

-- CreateTable
CREATE TABLE "gastos" (
    "id" SERIAL NOT NULL,
    "id_propiedad" INTEGER,
    "id_contrato" INTEGER,
    "id_liquidacion" INTEGER,
    "concepto" TEXT NOT NULL,
    "categoria_interno" TEXT,
    "monto" DECIMAL(15,2) NOT NULL,
    "tipo" "TipoGasto" NOT NULL DEFAULT 'ARREGLO',
    "cargo_a" "CargoA" NOT NULL DEFAULT 'PROPIETARIO',
    "estado_pago" "EstadoGasto" NOT NULL DEFAULT 'PENDIENTE',

    CONSTRAINT "gastos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transacciones" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoTransaccion" NOT NULL,
    "caja_destino" "CajaDestino" NOT NULL,
    "monto" DECIMAL(15,2) NOT NULL,
    "fecha_transaccion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_contrato" INTEGER,
    "id_usuario_creador" INTEGER,
    "id_txn_origen" INTEGER,
    "comentario" TEXT,

    CONSTRAINT "transacciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aplicaciones_pago" (
    "id" SERIAL NOT NULL,
    "id_transaccion" INTEGER NOT NULL,
    "id_periodo_pago" INTEGER,
    "id_gasto" INTEGER,
    "id_liquidacion" INTEGER,
    "tipo_aplicacion" "TipoAplicacion" NOT NULL,
    "monto_aplicado" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "aplicaciones_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidaciones" (
    "id" SERIAL NOT NULL,
    "id_propietario" INTEGER NOT NULL,
    "fecha_corrida" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "monto_bruto" DECIMAL(15,2) NOT NULL,
    "retenciones" DECIMAL(15,2) NOT NULL,
    "monto_neto" DECIMAL(15,2) NOT NULL,
    "estado" "EstadoLiquidacion" NOT NULL DEFAULT 'PENDIENTE',

    CONSTRAINT "liquidaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidaciones_items" (
    "id" SERIAL NOT NULL,
    "id_liquidacion" INTEGER NOT NULL,
    "id_contrato" INTEGER NOT NULL,
    "monto_bruto" DECIMAL(15,2) NOT NULL,
    "comision" DECIMAL(15,2) NOT NULL,
    "gastos" DECIMAL(15,2) NOT NULL,
    "monto_neto" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "liquidaciones_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" VARCHAR(36) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "response_status" INTEGER NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_id_propiedad_fkey" FOREIGN KEY ("id_propiedad") REFERENCES "propiedades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_id_contrato_fkey" FOREIGN KEY ("id_contrato") REFERENCES "contratos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_id_liquidacion_fkey" FOREIGN KEY ("id_liquidacion") REFERENCES "liquidaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_id_contrato_fkey" FOREIGN KEY ("id_contrato") REFERENCES "contratos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_id_usuario_creador_fkey" FOREIGN KEY ("id_usuario_creador") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_id_txn_origen_fkey" FOREIGN KEY ("id_txn_origen") REFERENCES "transacciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicaciones_pago" ADD CONSTRAINT "aplicaciones_pago_id_transaccion_fkey" FOREIGN KEY ("id_transaccion") REFERENCES "transacciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicaciones_pago" ADD CONSTRAINT "aplicaciones_pago_id_periodo_pago_fkey" FOREIGN KEY ("id_periodo_pago") REFERENCES "periodos_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicaciones_pago" ADD CONSTRAINT "aplicaciones_pago_id_gasto_fkey" FOREIGN KEY ("id_gasto") REFERENCES "gastos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicaciones_pago" ADD CONSTRAINT "aplicaciones_pago_id_liquidacion_fkey" FOREIGN KEY ("id_liquidacion") REFERENCES "liquidaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_id_propietario_fkey" FOREIGN KEY ("id_propietario") REFERENCES "propietarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones_items" ADD CONSTRAINT "liquidaciones_items_id_liquidacion_fkey" FOREIGN KEY ("id_liquidacion") REFERENCES "liquidaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones_items" ADD CONSTRAINT "liquidaciones_items_id_contrato_fkey" FOREIGN KEY ("id_contrato") REFERENCES "contratos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

