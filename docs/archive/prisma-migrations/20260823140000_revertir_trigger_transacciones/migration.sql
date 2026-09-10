-- Revierte 20260823130000: no hacía falta relajar el trigger de inmutabilidad.
-- El saldo disponible de una transacción se calcula sumando sus
-- AplicacionPago (mismo patrón "todo reconstruible" que ya usa el resto del
-- sistema, ej. Cargo.monto_pendiente por sus aplicaciones), sin necesitar
-- ningún campo mutable en `transacciones`. El trigger vuelve a bloquear
-- CUALQUIER UPDATE/DELETE, sin excepción, tal como en su diseño original.
CREATE OR REPLACE FUNCTION prevent_transacciones_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'La tabla transacciones es inmutable: no se permite UPDATE ni DELETE. Use un CONTRA_ASIENTO.';
END;
$$ LANGUAGE plpgsql;

-- El campo monto_sin_aplicar (agregado en 20260823120000) también se
-- elimina — no hace falta, el saldo se calcula, no se cachea.
ALTER TABLE "transacciones" DROP COLUMN "monto_sin_aplicar";
