-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EstadoOutboxCierre" AS ENUM ('PENDIENTE', 'PROCESANDO', 'COMPLETADO', 'ERROR');

-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('ADMIN', 'EMPLEADO', 'AUDITOR');

-- CreateEnum
CREATE TYPE "EstadoContrato" AS ENUM ('BORRADOR', 'ACTIVO', 'MOROSO', 'POR_VENCER', 'VENCIDO', 'RESCINDIDO');

-- CreateEnum
CREATE TYPE "EstadoCiclo" AS ENUM ('FUTURO', 'ABIERTO', 'CERRADO');

-- CreateEnum
CREATE TYPE "TipoCargo" AS ENUM ('ALQUILER', 'GASTO', 'PUNITORIO', 'AJUSTE');

-- CreateEnum
CREATE TYPE "IndiceActualizacion" AS ENUM ('ICL', 'IPC', 'ACUERDO');

-- CreateEnum
CREATE TYPE "EstrategiaConfeccion" AS ENUM ('UN_ALQUILER', 'PORCENTAJE_5');

-- CreateEnum
CREATE TYPE "TipoTransaccion" AS ENUM ('INGRESO_COBRO', 'INGRESO_COMISION', 'INGRESO_PUNITORIO', 'INGRESO_ALQUILER_PROPIO', 'INGRESO_CONFECCION_CONTRATO', 'EGRESO_LIQUIDACION', 'EGRESO_TERCEROS', 'EGRESO_OPERATIVO', 'EGRESO_ADELANTO', 'CONTRA_ASIENTO');

-- CreateEnum
CREATE TYPE "CajaDestino" AS ENUM ('TERCEROS', 'OPERATIVA');

-- CreateEnum
CREATE TYPE "CargoA" AS ENUM ('INQUILINO', 'PROPIETARIO', 'INMOBILIARIA');

-- CreateEnum
CREATE TYPE "TipoGasto" AS ENUM ('ARREGLO', 'EXPENSA', 'GAS', 'LUZ', 'IMPUESTO', 'CONFECCION_CONTRATO', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoGasto" AS ENUM ('PENDIENTE', 'PAGADO_PROVEEDOR');

-- CreateEnum
CREATE TYPE "EstadoLiquidacion" AS ENUM ('PENDIENTE', 'APROBADA', 'PAGADA');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "rol" "RolUsuario" NOT NULL,
    "puede_aprobar_liquidaciones" BOOLEAN NOT NULL DEFAULT false,
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
    "fecha_ultimo_ajuste" DATE,
    "cobra_confeccion" BOOLEAN NOT NULL DEFAULT false,
    "estrategia_confeccion" "EstrategiaConfeccion",

    CONSTRAINT "contratos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_cierre_periodo" (
    "id" SERIAL NOT NULL,
    "id_contrato" INTEGER NOT NULL,
    "estado" "EstadoOutboxCierre" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "procesado_en" TIMESTAMP(3),

    CONSTRAINT "outbox_cierre_periodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periodos_pago" (
    "id" SERIAL NOT NULL,
    "id_contrato" INTEGER NOT NULL,
    "periodo" VARCHAR(7) NOT NULL,
    "fecha_vencimiento" DATE NOT NULL,
    "estado_ciclo" "EstadoCiclo" NOT NULL DEFAULT 'ABIERTO',
    "credito_heredado" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "credito_al_cierre" DECIMAL(15,2),

    CONSTRAINT "periodos_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cargos" (
    "id" SERIAL NOT NULL,
    "id_periodo" INTEGER NOT NULL,
    "id_contrato" INTEGER NOT NULL,
    "tipo" "TipoCargo" NOT NULL,
    "monto" DECIMAL(15,2) NOT NULL,
    "descripcion" TEXT,
    "id_gasto" INTEGER,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_cargo_origen" INTEGER,
    "fecha_punitorio_desde" DATE,
    "fecha_punitorio_hasta" DATE,

    CONSTRAINT "cargos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gastos" (
    "id" SERIAL NOT NULL,
    "id_propiedad" INTEGER,
    "id_contrato" INTEGER,
    "id_liquidacion_item" INTEGER,
    "concepto" TEXT NOT NULL,
    "categoria_interno" TEXT,
    "monto" DECIMAL(15,2) NOT NULL,
    "tipo" "TipoGasto" NOT NULL DEFAULT 'ARREGLO',
    "cargo_a" "CargoA" NOT NULL DEFAULT 'PROPIETARIO',
    "estado_pago" "EstadoGasto" NOT NULL DEFAULT 'PENDIENTE',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

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
    "id_propietario" INTEGER,
    "id_usuario_creador" INTEGER,
    "id_txn_origen" INTEGER,
    "comentario" TEXT,

    CONSTRAINT "transacciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aplicaciones_pago" (
    "id" SERIAL NOT NULL,
    "id_transaccion" INTEGER NOT NULL,
    "id_cargo" INTEGER NOT NULL,
    "id_liquidacion_item" INTEGER,
    "monto_aplicado" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "aplicaciones_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidaciones" (
    "id" SERIAL NOT NULL,
    "id_propietario" INTEGER NOT NULL,
    "fecha_corrida" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_desde" DATE NOT NULL,
    "fecha_hasta" DATE NOT NULL,
    "monto_bruto" DECIMAL(15,2) NOT NULL,
    "retenciones" DECIMAL(15,2) NOT NULL,
    "adelantos_descontados" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "monto_neto" DECIMAL(15,2) NOT NULL,
    "estado" "EstadoLiquidacion" NOT NULL DEFAULT 'PENDIENTE',

    CONSTRAINT "liquidaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidaciones_items" (
    "id" SERIAL NOT NULL,
    "id_liquidacion" INTEGER NOT NULL,
    "id_periodo" INTEGER,
    "id_propiedad" INTEGER NOT NULL,
    "monto_bruto" DECIMAL(15,2) NOT NULL,
    "comision" DECIMAL(15,2) NOT NULL,
    "gastos" DECIMAL(15,2) NOT NULL,
    "monto_neto" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "liquidaciones_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deducciones_adelanto" (
    "id" SERIAL NOT NULL,
    "id_transaccion" INTEGER NOT NULL,
    "id_liquidacion" INTEGER NOT NULL,
    "monto_descontado" DECIMAL(15,2) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deducciones_adelanto_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "cargos_id_contrato_idx" ON "cargos"("id_contrato");

-- CreateIndex
CREATE UNIQUE INDEX "cargos_id_cargo_origen_fecha_punitorio_desde_key" ON "cargos"("id_cargo_origen", "fecha_punitorio_desde");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_id_propietario_fkey" FOREIGN KEY ("id_propietario") REFERENCES "propietarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "propiedades" ADD CONSTRAINT "propiedades_id_propietario_fkey" FOREIGN KEY ("id_propietario") REFERENCES "propietarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_id_propiedad_fkey" FOREIGN KEY ("id_propiedad") REFERENCES "propiedades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_id_inquilino_fkey" FOREIGN KEY ("id_inquilino") REFERENCES "inquilinos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_cierre_periodo" ADD CONSTRAINT "outbox_cierre_periodo_id_contrato_fkey" FOREIGN KEY ("id_contrato") REFERENCES "contratos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodos_pago" ADD CONSTRAINT "periodos_pago_id_contrato_fkey" FOREIGN KEY ("id_contrato") REFERENCES "contratos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_id_periodo_fkey" FOREIGN KEY ("id_periodo") REFERENCES "periodos_pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_id_contrato_fkey" FOREIGN KEY ("id_contrato") REFERENCES "contratos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_id_gasto_fkey" FOREIGN KEY ("id_gasto") REFERENCES "gastos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargos" ADD CONSTRAINT "cargos_id_cargo_origen_fkey" FOREIGN KEY ("id_cargo_origen") REFERENCES "cargos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_id_propiedad_fkey" FOREIGN KEY ("id_propiedad") REFERENCES "propiedades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_id_contrato_fkey" FOREIGN KEY ("id_contrato") REFERENCES "contratos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_id_liquidacion_item_fkey" FOREIGN KEY ("id_liquidacion_item") REFERENCES "liquidaciones_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_id_contrato_fkey" FOREIGN KEY ("id_contrato") REFERENCES "contratos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_id_propietario_fkey" FOREIGN KEY ("id_propietario") REFERENCES "propietarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_id_usuario_creador_fkey" FOREIGN KEY ("id_usuario_creador") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_id_txn_origen_fkey" FOREIGN KEY ("id_txn_origen") REFERENCES "transacciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicaciones_pago" ADD CONSTRAINT "aplicaciones_pago_id_transaccion_fkey" FOREIGN KEY ("id_transaccion") REFERENCES "transacciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicaciones_pago" ADD CONSTRAINT "aplicaciones_pago_id_cargo_fkey" FOREIGN KEY ("id_cargo") REFERENCES "cargos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aplicaciones_pago" ADD CONSTRAINT "aplicaciones_pago_id_liquidacion_item_fkey" FOREIGN KEY ("id_liquidacion_item") REFERENCES "liquidaciones_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_id_propietario_fkey" FOREIGN KEY ("id_propietario") REFERENCES "propietarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones_items" ADD CONSTRAINT "liquidaciones_items_id_liquidacion_fkey" FOREIGN KEY ("id_liquidacion") REFERENCES "liquidaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones_items" ADD CONSTRAINT "liquidaciones_items_id_periodo_fkey" FOREIGN KEY ("id_periodo") REFERENCES "periodos_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones_items" ADD CONSTRAINT "liquidaciones_items_id_propiedad_fkey" FOREIGN KEY ("id_propiedad") REFERENCES "propiedades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deducciones_adelanto" ADD CONSTRAINT "deducciones_adelanto_id_transaccion_fkey" FOREIGN KEY ("id_transaccion") REFERENCES "transacciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deducciones_adelanto" ADD CONSTRAINT "deducciones_adelanto_id_liquidacion_fkey" FOREIGN KEY ("id_liquidacion") REFERENCES "liquidaciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION public.rechazar_mutacion_transacciones()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'La tabla transacciones es inmutable: no se permite UPDATE ni DELETE. Use un CONTRA_ASIENTO.';
END;
$$;

CREATE TRIGGER transacciones_inmutables
BEFORE UPDATE OR DELETE ON public.transacciones
FOR EACH ROW EXECUTE FUNCTION public.rechazar_mutacion_transacciones();
