-- ============================================================================
-- Lumane · 0066 · La página de cookies no nombra a Supabase
-- ============================================================================
-- Mismo criterio que la 0063 con la tabla de proveedores del aviso de
-- privacidad: se describe QUÉ hace cada cookie, no con qué infraestructura
-- está hecho el sitio. La fila queda como «Cookies de sesión»; su propósito y
-- su duración no cambian.
--
-- `replace` sobre el texto exacto; falla si ya no está.
-- ============================================================================

do $$
declare
  antes text;
  despues text;
begin
  select body into antes from public.pages where slug = 'cookies';

  despues := replace(antes, '| Cookies de sesión de Supabase |', '| Cookies de sesión |');
  if despues = antes then raise exception 'cookies: no encontré la fila de Supabase'; end if;

  update public.pages set body = despues where slug = 'cookies';
end
$$;
