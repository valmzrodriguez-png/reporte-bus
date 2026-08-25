-- =====================================================
-- Nuevas columnas del detalle de producción
-- Tabla: registros_semanales
--
-- Ejecutar en el SQL Editor del Dashboard de Supabase
-- o con: supabase db push
-- Idempotente: se puede ejecutar más de una vez.
-- =====================================================

ALTER TABLE registros_semanales
    ADD COLUMN IF NOT EXISTS estado_dia VARCHAR(50) DEFAULT 'produccion',
    ADD COLUMN IF NOT EXISTS administracion NUMERIC(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS alimentacion_limpieza NUMERIC(10,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS conductor_porcentaje NUMERIC(5,2) DEFAULT 18.00,
    ADD COLUMN IF NOT EXISTS conductor_monto NUMERIC(10,2) DEFAULT 0.00;
