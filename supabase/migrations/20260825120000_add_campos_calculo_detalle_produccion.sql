-- =====================================================
-- Nuevos campos del detalle de producción
-- Tabla: registros_semanales
--
-- Aplicar con:  supabase db push
-- o pegando este archivo en el SQL Editor del Dashboard.
-- Idempotente: se puede ejecutar más de una vez.
-- =====================================================

alter table public.registros_semanales
    add column if not exists estado_dia text not null default 'produccion';

alter table public.registros_semanales
    add column if not exists administracion numeric(12, 2) not null default 0;

alter table public.registros_semanales
    add column if not exists alimentacion_limpieza numeric(12, 2) not null default 0;

alter table public.registros_semanales
    add column if not exists conductor_porcentaje numeric(5, 2) not null default 18;

alter table public.registros_semanales
    add column if not exists conductor_monto numeric(12, 2) not null default 0;
