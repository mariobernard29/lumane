-- ============================================================================
-- Lumane · 0065 · Términos y privacidad dejan de ser borrador
-- ============================================================================
-- Con la 0064 no quedó ningún `[COMPLETAR]`, y la propietaria dio los textos
-- por buenos: sale el recuadro «BORRADOR — REVISIÓN LEGAL PENDIENTE» del
-- principio de las dos páginas, junto con la línea en blanco que lo separaba
-- del primer título.
--
-- Falla si alguna de las dos ya no empieza con el recuadro, en vez de darlo
-- por quitado.
-- ============================================================================

do $$
declare
  pagina text;
  antes text;
  despues text;
begin
  foreach pagina in array array['privacidad', 'terminos'] loop
    select body into antes from public.pages where slug = pagina;

    despues := regexp_replace(antes, E'^> \\*\\*BORRADOR — REVISIÓN LEGAL PENDIENTE\\.\\*\\*[^\\n]*\\n+', '');
    if despues = antes then raise exception '%: no encontré el aviso de borrador', pagina; end if;

    update public.pages set body = despues where slug = pagina;
  end loop;
end
$$;
