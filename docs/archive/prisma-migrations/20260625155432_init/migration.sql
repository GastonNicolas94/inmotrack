-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('ADMIN', 'EMPLEADO', 'AUDITOR');

-- CreateEnum
CREATE TYPE "EstadoContrato" AS ENUM ('BORRADOR', 'ACTIVO', 'MOROSO', 'VENCIDO', 'RESCINDIDO');

-- CreateEnum
CREATE TYPE "EstadoPeriodo" AS ENUM ('CARGO_PENDIENTE', 'COBRADO_PARCIAL', 'COBRADO_TOTAL', 'VENCIDO_IMPAGO');

-- CreateEnum
CREATE TYPE "TipoTransaccion" AS ENUM ('INGRESO_COBRO', 'INGRESO_GARANTIA', 'TRANSFERENCIA_INTERNA', 'EGRESO_LIQUIDACION', 'EGRESO_TERCEROS', 'EGRESO_GARANTIA', 'PUNITORIO_DIARIO', 'CONTRA_ASIENTO');

-- CreateEnum
CREATE TYPE "CajaDestino" AS ENUM ('TERCEROS', 'OPERATIVA');

-- CreateEnum
CREATE TYPE "EstadoLiquidacion" AS ENUM ('PENDIENTE', 'APROBADA', 'PAGADA');

-- CreateEnum
CREATE TYPE "EstadoGasto" AS ENUM ('PENDIENTE', 'PAGADO_PROVEEDOR');

-- CreateEnum
CREATE TYPE "EstadoDeposito" AS ENUM ('RETENIDO', 'DEVUELTO_PARCIAL', 'DEVUELTO_TOTAL', 'APLICADO_A_DEUDA');

-- CreateEnum
CREATE TYPE "IndiceActualizacion" AS ENUM ('ICL', 'IPC', 'ACUERDO');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "rol" "RolUsuario" NOT NULL,
    "id_propietario" INTEGER,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "propietarios" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "cbu" VARCHAR(22) NOT NULL,

    CONSTRAINT "propietarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inquilinos" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "dni_cuit" VARCHAR(20) NOT NULL,
    "email" TEXT,
    "telefono" VARCHAR(20),

    CONSTRAINT "inquilinos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "propiedades" (
    "id" SERIAL NOT NULL,
    "id_propietario" INTEGER NOT NULL,
    "direccion" VARCHAR(500) NOT NULL,
    "es_propia" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "propiedades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contratos" (
    "id" SERIAL NOT NULL,
    "id_propiedad" INTEGER NOT NULL,
    "id_inquilino" INTEGER NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    "estado" "EstadoContrato" NOT NULL DEFAULT 'BORRADOR',
    "monto_base" DECIMAL(15,2) NOT NULL,
    "pct_comision" DECIMAL(5,2) NOT NULL,
    "pct_punitorio_diario" DECIMAL(5,4) NOT NULL DEFAULT 0.1000,
    "indice_act" "IndiceActualizacion",
    "meses_act" INTEGER,

    CONSTRAINT "contratos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periodos_pago" (
    "id" SERIAL NOT NULL,
    "id_contrato" INTEGER NOT NULL,
    "periodo" VARCHAR(7) NOT NULL,
    "monto_cargo" DECIMAL(15,2) NOT NULL,
    "monto_cobrado" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "estado" "EstadoPeriodo" NOT NULL DEFAULT 'CARGO_PENDIENTE',
    "fecha_vencimiento" DATE NOT NULL,

    CONSTRAINT "periodos_pago_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "gastos" (
    "id" SERIAL NOT NULL,
    "id_contrato" INTEGER NOT NULL,
    "monto" DECIMAL(15,2) NOT NULL,
    "proveedor" TEXT NOT NULL,
    "concepto" TEXT,
    "fecha_gasto" DATE NOT NULL,
    "estado_pago" "EstadoGasto" NOT NULL DEFAULT 'PENDIENTE',

    CONSTRAINT "gastos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "depositos_garantia" (
    "id" SERIAL NOT NULL,
    "id_contrato" INTEGER NOT NULL,
    "monto_original" DECIMAL(15,2) NOT NULL,
    "monto_retenido_danos" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "monto_devuelto" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "estado" "EstadoDeposito" NOT NULL DEFAULT 'RETENIDO',
    "fecha_resolucion" TIMESTAMP(3),
    "id_usuario_autorizante" INTEGER,

    CONSTRAINT "depositos_garantia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" VARCHAR(36) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "response_status" INTEGER NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "inquilinos_email_key" ON "inquilinos"("email");

-- CreateIndex
CREATE UNIQUE INDEX "periodos_pago_id_contrato_periodo_key" ON "periodos_pago"("id_contrato", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "depositos_garantia_id_contrato_key" ON "depositos_garantia"("id_contrato");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_id_propietario_fkey" FOREIGN KEY ("id_propietario") REFERENCES "propietarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propiedades" ADD CONSTRAINT "propiedades_id_propietario_fkey" FOREIGN KEY ("id_propietario") REFERENCES "propietarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_id_propiedad_fkey" FOREIGN KEY ("id_propiedad") REFERENCES "propiedades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_id_inquilino_fkey" FOREIGN KEY ("id_inquilino") REFERENCES "inquilinos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodos_pago" ADD CONSTRAINT "periodos_pago_id_contrato_fkey" FOREIGN KEY ("id_contrato") REFERENCES "contratos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_id_contrato_fkey" FOREIGN KEY ("id_contrato") REFERENCES "contratos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_id_usuario_creador_fkey" FOREIGN KEY ("id_usuario_creador") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_id_txn_origen_fkey" FOREIGN KEY ("id_txn_origen") REFERENCES "transacciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_id_propietario_fkey" FOREIGN KEY ("id_propietario") REFERENCES "propietarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones_items" ADD CONSTRAINT "liquidaciones_items_id_liquidacion_fkey" FOREIGN KEY ("id_liquidacion") REFERENCES "liquidaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones_items" ADD CONSTRAINT "liquidaciones_items_id_contrato_fkey" FOREIGN KEY ("id_contrato") REFERENCES "contratos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_id_contrato_fkey" FOREIGN KEY ("id_contrato") REFERENCES "contratos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depositos_garantia" ADD CONSTRAINT "depositos_garantia_id_contrato_fkey" FOREIGN KEY ("id_contrato") REFERENCES "contratos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depositos_garantia" ADD CONSTRAINT "depositos_garantia_id_usuario_autorizante_fkey" FOREIGN KEY ("id_usuario_autorizante") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
