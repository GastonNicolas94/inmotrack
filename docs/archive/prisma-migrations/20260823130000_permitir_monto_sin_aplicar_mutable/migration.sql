-- El trigger de inmutabilidad de transacciones (20260822100451) bloqueaba
-- CUALQUIER UPDATE, sin excepción. El modelo de saldo a favor (motor de
-- períodos y movimientos, 2026-08-23) necesita actualizar `monto_sin_aplicar`
-- — una proyección cacheada del saldo pendiente de aplicar, no parte del
-- ledger inmutable en sí (mismo rol que `Cargo.monto_pendiente` en su
-- propia tabla). Este cambio permite ÚNICAMENTE ese campo como mutable;
-- cualquier intento de cambiar el monto, tipo, caja, contrato, usuario,
-- origen de contra-asiento o comentario sigue bloqueado igual que antes.
--
-- REVERTIDO en 20260823140000_revertir_trigger_transacciones — se determinó
-- que no hacía falta, ver esa migración.
CREATE OR REPLACE FUNCTION prevent_transacciones_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'La tabla transacciones es inmutable: no se permite DELETE. Use un CONTRA_ASIENTO.';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.caja_destino IS DISTINCT FROM OLD.caja_destino
     OR NEW.monto IS DISTINCT FROM OLD.monto
     OR NEW.fecha_transaccion IS DISTINCT FROM OLD.fecha_transaccion
     OR NEW.id_contrato IS DISTINCT FROM OLD.id_contrato
     OR NEW.id_usuario_creador IS DISTINCT FROM OLD.id_usuario_creador
     OR NEW.id_txn_origen IS DISTINCT FROM OLD.id_txn_origen
     OR NEW.comentario IS DISTINCT FROM OLD.comentario
  THEN
    RAISE EXCEPTION 'La tabla transacciones es inmutable: no se permite modificar el monto, tipo ni metadata del movimiento. Use un CONTRA_ASIENTO.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
