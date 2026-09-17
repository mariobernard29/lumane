-- ============================================================================
-- Lumane · 0030 · Corrección crítica: las políticas RLS no podían evaluarse
-- ============================================================================
-- BUG: el sitio entero fallaba para CUALQUIER clienta con sesión iniciada.
--
-- La migración 0001 revocó todo acceso al esquema `private`, y la 0002/0005
-- revocaron EXECUTE sobre sus helpers. La intención era buena —`private` no es
-- API pública— pero rompe algo que no se ve hasta iniciar sesión:
--
-- Las expresiones de una política RLS se evalúan CON LOS PERMISOS DEL USUARIO
-- QUE CONSULTA. Casi todas las tablas tienen dos políticas permisivas: una de
-- lectura pública y otra del personal que llama a `private.has_permission()`.
-- Postgres evalúa AMBAS (las permisivas se combinan con OR), así que en cuanto
-- el rol es `authenticated` intenta ejecutar el helper y aborta con
-- "permission denied for function has_permission" — la consulta completa, no
-- solo la rama del personal.
--
-- Como `anon` no entra en las políticas del personal (son `to authenticated`),
-- el problema era INVISIBLE mientras se probaba sin sesión. La primera clienta
-- que entró se encontró la tienda sin navegación y sin sus datos.
--
-- CORRECCIÓN: `authenticated` recibe USAGE sobre `private` y EXECUTE sobre los
-- tres helpers que aparecen en políticas.
--
-- ¿No expone eso el esquema privado? No. Lo que protege a `private` no es el
-- revoke: es que PostgREST solo publica los esquemas configurados (`public`),
-- así que `private.has_permission` no es alcanzable por /rest/v1/rpc ni con
-- este GRANT. El revoke solo estaba impidiendo que RLS hiciera su trabajo.
--
-- `anon` NO recibe nada: ninguna política suya llama a estos helpers, y los
-- RPC que sí los usan son SECURITY DEFINER y corren como el dueño.
-- ============================================================================

grant usage on schema private to authenticated;

grant execute on function private.has_permission(text)     to authenticated;
grant execute on function private.is_staff()               to authenticated;
grant execute on function private.current_customer_id()    to authenticated;
-- Usado por los RPC del POS a través de políticas de inventario y caja.
grant execute on function private.current_location_id()    to authenticated;

comment on schema private is
  'Helpers de autorización y utilidades internas. NO está en los esquemas publicados por PostgREST, así que nada de aquí es alcanzable por la API: los GRANT existen solo para que RLS pueda evaluar las políticas.';
