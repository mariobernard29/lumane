-- ============================================================================
-- Lumane · 0068 · La portada con un solo botón, y «calidad» en vez de cambios
-- ============================================================================
-- Dos cambios que pidió la propietaria:
--
--   1. Sale el botón «Pieza destacada» de la portada; queda solo «Ver
--      colección». `Hero` ya pinta el segundo botón solo si tiene texto Y
--      enlace, así que basta con vaciar los dos.
--   2. En la barra de servicios, «14 días para cambiar de opinión» pasa a
--      «Altos estándares de calidad», con el icono `verified` (insignia con
--      palomita) en lugar de `autorenew`. `verified` ya está en el subconjunto
--      de Material Symbols del sitio (apps/web/src/app/fonts/icon-names.txt);
--      un icono que no estuviera ahí se pintaría como su nombre en texto.
--
-- La política de 14 días no cambia: sigue en «Envíos y devoluciones» y en los
-- términos. Solo deja de anunciarse en la barra.
--
-- Falla si no encuentra lo que va a cambiar, para no dar por hecho un cambio
-- que no ocurrió si alguien ya lo editó desde el panel.
-- ============================================================================

do $$
begin
  update public.hero_slides
  set secondary_cta_label = null,
      secondary_cta_href  = null
  where page_key = 'home' and secondary_cta_label = 'Pieza destacada';
  if not found then raise exception 'portada: no encontré el botón «Pieza destacada»'; end if;

  update public.banners
  set title     = 'Altos estándares de calidad',
      cta_label = 'verified'
  where slot_key = 'services' and title = '14 días para cambiar de opinión';
  if not found then raise exception 'services: no encontré la franja de los 14 días'; end if;
end
$$;
