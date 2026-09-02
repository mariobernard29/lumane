-- ============================================================================
-- Lumane · 0012 · Endurecimiento del search_path y notas de seguridad
-- ============================================================================
-- El linter de Supabase marcó private.f_unaccent con search_path mutable. Se
-- fija a '' (todo dentro ya está calificado por esquema) sin perder la
-- inmutabilidad, que es lo que permite usarla en la columna generada
-- products.search_vector.
--
-- outbox_events aparece como "RLS enabled, no policy": es deliberado. Sin
-- políticas, la tabla es inalcanzable salvo para service_role, que es
-- exactamente quien debe consumirla (el worker de correo).
-- ============================================================================

create or replace function private.f_unaccent(text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;

comment on table public.outbox_events is
  'Cola de eventos de dominio. RLS activa SIN políticas a propósito: solo service_role (el worker de correo del servidor) debe alcanzarla. Nunca se lee desde el navegador ni desde el POS.';

comment on table public.audit_log is
  'Bitácora de cambios sensibles. Solo lectura para el rol owner; se escribe desde RPC.';
