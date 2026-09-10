-- Exactamente uno de id_periodo_pago / id_gasto en aplicaciones_pago
ALTER TABLE "aplicaciones_pago"
  ADD CONSTRAINT "chk_aplicacion_exclusiva"
  CHECK (
    (id_periodo_pago IS NOT NULL AND id_gasto IS NULL) OR
    (id_periodo_pago IS NULL AND id_gasto IS NOT NULL)
  );

-- Si tipo_aplicacion = 'GASTO', id_liquidacion debe ser NULL
ALTER TABLE "aplicaciones_pago"
  ADD CONSTRAINT "chk_gasto_sin_liquidacion"
  CHECK (
    tipo_aplicacion != 'GASTO' OR id_liquidacion IS NULL
  );

-- Gasto sin propiedad debe ser cargo de la inmobiliaria
ALTER TABLE "gastos"
  ADD CONSTRAINT "chk_gasto_propio_inmobiliaria"
  CHECK (
    id_propiedad IS NOT NULL OR cargo_a = 'INMOBILIARIA'
  );

-- Inmutabilidad del libro diario: bloquear UPDATE y DELETE a nivel de rol de aplicación.
-- CURRENT_USER es el rol con el que Prisma se conecta (definido en DATABASE_URL / prisma.config.ts).
REVOKE UPDATE, DELETE ON "transacciones" FROM CURRENT_USER;
