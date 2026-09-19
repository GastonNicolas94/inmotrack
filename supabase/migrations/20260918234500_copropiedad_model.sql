-- Copropiedad: modelo aditivo para migrar de un propietario único a N propietarios.
-- El campo propiedades.id_propietario se conserva temporalmente para compatibilidad
-- y se eliminará cuando todos los consumidores hayan migrado.

CREATE TABLE "propiedades_propietarios" (
  "id" SERIAL NOT NULL,
  "id_propiedad" INTEGER NOT NULL,
  "id_propietario" INTEGER NOT NULL,
  "porcentaje" DECIMAL(5,2) NOT NULL,
  CONSTRAINT "propiedades_propietarios_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "propiedades_propietarios_porcentaje_check"
    CHECK ("porcentaje" > 0 AND "porcentaje" <= 100)
);

CREATE UNIQUE INDEX "propiedades_propietarios_id_propiedad_id_propietario_key"
  ON "propiedades_propietarios"("id_propiedad", "id_propietario");
CREATE INDEX "propiedades_propietarios_id_propietario_idx"
  ON "propiedades_propietarios"("id_propietario");

ALTER TABLE "propiedades_propietarios"
  ADD CONSTRAINT "propiedades_propietarios_id_propiedad_fkey"
  FOREIGN KEY ("id_propiedad") REFERENCES "propiedades"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "propiedades_propietarios"
  ADD CONSTRAINT "propiedades_propietarios_id_propietario_fkey"
  FOREIGN KEY ("id_propietario") REFERENCES "propietarios"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "propiedades_propietarios" ("id_propiedad", "id_propietario", "porcentaje")
SELECT "id", "id_propietario", 100.00
FROM "propiedades";

ALTER TABLE "liquidaciones_items"
  ADD COLUMN "porcentaje_participacion" DECIMAL(5,2) NOT NULL DEFAULT 100.00;

CREATE TABLE "aplicaciones_pago_propietarios" (
  "id" SERIAL NOT NULL,
  "id_aplicacion_pago" INTEGER NOT NULL,
  "id_propietario" INTEGER NOT NULL,
  "id_liquidacion_item" INTEGER,
  "porcentaje_participacion" DECIMAL(5,2) NOT NULL,
  "monto_asignado" DECIMAL(15,2) NOT NULL,
  CONSTRAINT "aplicaciones_pago_propietarios_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "aplicaciones_pago_propietarios_porcentaje_check"
    CHECK ("porcentaje_participacion" > 0 AND "porcentaje_participacion" <= 100)
);

CREATE UNIQUE INDEX "aplicaciones_pago_propietarios_aplicacion_propietario_key"
  ON "aplicaciones_pago_propietarios"("id_aplicacion_pago", "id_propietario");
CREATE INDEX "aplicaciones_pago_propietarios_propietario_liquidacion_idx"
  ON "aplicaciones_pago_propietarios"("id_propietario", "id_liquidacion_item");

ALTER TABLE "aplicaciones_pago_propietarios"
  ADD CONSTRAINT "aplicaciones_pago_propietarios_aplicacion_fkey"
  FOREIGN KEY ("id_aplicacion_pago") REFERENCES "aplicaciones_pago"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "aplicaciones_pago_propietarios"
  ADD CONSTRAINT "aplicaciones_pago_propietarios_propietario_fkey"
  FOREIGN KEY ("id_propietario") REFERENCES "propietarios"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "aplicaciones_pago_propietarios"
  ADD CONSTRAINT "aplicaciones_pago_propietarios_liquidacion_item_fkey"
  FOREIGN KEY ("id_liquidacion_item") REFERENCES "liquidaciones_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "gastos_propietarios" (
  "id" SERIAL NOT NULL,
  "id_gasto" INTEGER NOT NULL,
  "id_propietario" INTEGER NOT NULL,
  "id_liquidacion_item" INTEGER,
  "porcentaje_participacion" DECIMAL(5,2) NOT NULL,
  "monto_asignado" DECIMAL(15,2) NOT NULL,
  CONSTRAINT "gastos_propietarios_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gastos_propietarios_porcentaje_check"
    CHECK ("porcentaje_participacion" > 0 AND "porcentaje_participacion" <= 100)
);

CREATE UNIQUE INDEX "gastos_propietarios_gasto_propietario_key"
  ON "gastos_propietarios"("id_gasto", "id_propietario");
CREATE INDEX "gastos_propietarios_propietario_liquidacion_idx"
  ON "gastos_propietarios"("id_propietario", "id_liquidacion_item");

ALTER TABLE "gastos_propietarios"
  ADD CONSTRAINT "gastos_propietarios_gasto_fkey"
  FOREIGN KEY ("id_gasto") REFERENCES "gastos"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gastos_propietarios"
  ADD CONSTRAINT "gastos_propietarios_propietario_fkey"
  FOREIGN KEY ("id_propietario") REFERENCES "propietarios"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gastos_propietarios"
  ADD CONSTRAINT "gastos_propietarios_liquidacion_item_fkey"
  FOREIGN KEY ("id_liquidacion_item") REFERENCES "liquidaciones_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Historial ya liquidado: cada fuente existente pertenecía a un único propietario.
-- Se crea la asignación equivalente al 100% usando el propietario de la liquidación,
-- que es la fuente histórica correcta aunque la propiedad haya cambiado después.
INSERT INTO "aplicaciones_pago_propietarios" (
  "id_aplicacion_pago",
  "id_propietario",
  "id_liquidacion_item",
  "porcentaje_participacion",
  "monto_asignado"
)
SELECT
  ap."id",
  l."id_propietario",
  ap."id_liquidacion_item",
  100.00,
  ap."monto_aplicado"
FROM "aplicaciones_pago" ap
JOIN "liquidaciones_items" li ON li."id" = ap."id_liquidacion_item"
JOIN "liquidaciones" l ON l."id" = li."id_liquidacion"
WHERE ap."id_liquidacion_item" IS NOT NULL;

INSERT INTO "gastos_propietarios" (
  "id_gasto",
  "id_propietario",
  "id_liquidacion_item",
  "porcentaje_participacion",
  "monto_asignado"
)
SELECT
  g."id",
  l."id_propietario",
  g."id_liquidacion_item",
  100.00,
  g."monto"
FROM "gastos" g
JOIN "liquidaciones_items" li ON li."id" = g."id_liquidacion_item"
JOIN "liquidaciones" l ON l."id" = li."id_liquidacion"
WHERE g."id_liquidacion_item" IS NOT NULL;
