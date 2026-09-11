-- CreateEnum
CREATE TYPE "EstadoOutboxCierre" AS ENUM ('PENDIENTE', 'PROCESANDO', 'COMPLETADO', 'ERROR');

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

-- AddForeignKey
ALTER TABLE "outbox_cierre_periodo" ADD CONSTRAINT "outbox_cierre_periodo_id_contrato_fkey" FOREIGN KEY ("id_contrato") REFERENCES "contratos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
