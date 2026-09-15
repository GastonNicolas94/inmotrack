-- CreateEnum
CREATE TYPE "EstadoAjusteContrato" AS ENUM ('PENDIENTE', 'APLICADO');

-- CreateTable
CREATE TABLE "ajustes_contrato" (
    "id" SERIAL NOT NULL,
    "id_contrato" INTEGER NOT NULL,
    "periodo_efectivo" VARCHAR(7) NOT NULL,
    "indice" "IndiceActualizacion" NOT NULL,
    "monto_anterior" DECIMAL(15,2) NOT NULL,
    "monto_nuevo" DECIMAL(15,2),
    "estado" "EstadoAjusteContrato" NOT NULL DEFAULT 'PENDIENTE',
    "observacion" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aplicado_en" TIMESTAMP(3),
    "id_usuario_aplicador" INTEGER,

    CONSTRAINT "ajustes_contrato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ajustes_contrato_id_contrato_periodo_efectivo_key"
ON "ajustes_contrato"("id_contrato", "periodo_efectivo");

-- CreateIndex
CREATE INDEX "ajustes_contrato_estado_idx" ON "ajustes_contrato"("estado");

-- AddForeignKey
ALTER TABLE "ajustes_contrato"
ADD CONSTRAINT "ajustes_contrato_id_contrato_fkey"
FOREIGN KEY ("id_contrato") REFERENCES "contratos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustes_contrato"
ADD CONSTRAINT "ajustes_contrato_id_usuario_aplicador_fkey"
FOREIGN KEY ("id_usuario_aplicador") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
