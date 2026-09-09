-- Bloqueo de inmutabilidad independiente del rol de conexión: el REVOKE UPDATE/DELETE
-- de la migración anterior no tiene efecto si el rol de la app es superusuario de
-- Postgres (los superusuarios ignoran GRANT/REVOKE por diseño). Un trigger sí se
-- dispara siempre, salvo desactivación explícita y deliberada — que es un caso
-- distinto de un UPDATE/DELETE accidental de código de aplicación.
CREATE OR REPLACE FUNCTION prevent_transacciones_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'La tabla transacciones es inmutable: no se permite UPDATE ni DELETE. Use un CONTRA_ASIENTO.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transacciones_immutable
BEFORE UPDATE OR DELETE ON "transacciones"
FOR EACH ROW EXECUTE FUNCTION prevent_transacciones_mutation();
