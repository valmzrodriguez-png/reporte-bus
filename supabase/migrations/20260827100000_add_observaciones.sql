-- =====================================================
-- Columna de observaciones del registro diario
-- Tabla: registros_semanales
--
-- Ejecutar en el SQL Editor del Dashboard de Supabase
-- o con: supabase db push
-- Idempotente: se puede ejecutar más de una vez.
-- =====================================================

ALTER TABLE registros_semanales
    ADD COLUMN IF NOT EXISTS observaciones TEXT DEFAULT NULL;