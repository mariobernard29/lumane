-- ============================================================================
-- Lumane · 0020 · Texto alternativo en categorías y colecciones
-- ============================================================================
-- `product_images` ya obliga a capturar `alt_text`, pero las imágenes de
-- categoría y colección no tenían dónde guardarlo, así que la interfaz lo
-- generaba ("Categoría Vestidos"). Eso es peor que no ponerlo: describe la
-- etiqueta, no la fotografía, y quien navega con lector de pantalla no se
-- entera de nada.
--
-- El prototipo sí traía textos escritos a mano ("Modelo con vestido largo de
-- encaje negro…"). Esta columna les da un sitio y los vuelve editables desde
-- el administrador, como todo lo demás.
-- ============================================================================

alter table public.categories add column if not exists image_alt text;
alter table public.collections add column if not exists image_alt text;

comment on column public.categories.image_alt is
  'Descripción de la fotografía para lectores de pantalla y SEO. Describe la imagen, no la categoría.';
comment on column public.collections.image_alt is
  'Descripción de la fotografía para lectores de pantalla y SEO.';
