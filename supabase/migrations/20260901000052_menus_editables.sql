-- ============================================================================
-- Lumane · 0052 · Las columnas del pie dejan de estar escritas en el código
-- ============================================================================
-- `apps/web/src/lib/queries/layout.ts` tenía esto:
--
--     const FOOTER_TITLES = {
--       footer_tienda: 'Tienda',
--       footer_ayuda:  'Ayuda',
--       footer_casa:   'La casa',
--     }
--
-- Tres cosas a la vez, y las tres en el código: los TÍTULOS de las columnas,
-- CUÁLES de los menús son columnas del pie, y en qué ORDEN salen. La regla 2
-- del proyecto dice que ningún texto del sitio vive en el código, y ese objeto
-- llevaba ahí desde la Fase 1.
--
-- Aquí se resuelven las tres:
--
--   * El título pasa a ser `navigation_menus.name`, que ya existía y solo se
--     usaba como etiqueta interna.
--   * Cuáles son columnas se deduce del prefijo `footer_`, salvo `footer_legal`
--     que es la línea de abajo y no una columna.
--   * El orden necesita una columna nueva: por clave alfabética saldría ayuda,
--     casa, tienda, que no es el orden que tiene el sitio hoy.
-- ============================================================================

alter table public.navigation_menus
  add column if not exists position integer not null default 0;

comment on column public.navigation_menus.position is
  'Orden de las columnas del pie. El header no lo usa: solo hay uno.';

-- Los nombres pasan de etiqueta interna a texto visible. «Footer · Tienda»
-- servía para distinguirlos en un editor de SQL; en el pie del sitio tiene que
-- leerse «Tienda».
update public.navigation_menus set name = 'Tienda',  position = 1 where key = 'footer_tienda';
update public.navigation_menus set name = 'Ayuda',   position = 2 where key = 'footer_ayuda';
update public.navigation_menus set name = 'La casa', position = 3 where key = 'footer_casa';

-- `footer_legal` no es una columna: son los enlaces pequeños de la última
-- línea. Su nombre no se pinta en ningún sitio, así que se deja descriptivo.
update public.navigation_menus set name = 'Legal', position = 9 where key = 'footer_legal';
