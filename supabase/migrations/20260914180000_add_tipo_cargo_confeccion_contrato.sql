-- La confección de contrato es una deuda del inquilino y no una erogación.
-- No hay backfill: los datos existentes son únicamente de prueba.
ALTER TYPE "TipoCargo" ADD VALUE IF NOT EXISTS 'CONFECCION_CONTRATO';
