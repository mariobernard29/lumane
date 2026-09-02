-- ============================================================================
-- Lumane · 0026 · Nota de ajuste del producto
-- ============================================================================
-- La ficha del prototipo cierra el selector de tallas con una línea que evita
-- la mitad de las devoluciones de una boutique: "La modelo mide 1.75 m y usa
-- talla 38."
--
-- Es contenido por pieza y lo escribe quien la fotografía, así que necesita su
-- propia columna. Meterlo dentro de la descripción larga lo escondería dentro
-- de un acordeón plegado, justo donde no sirve para decidir la talla.
-- ============================================================================

alter table public.products add column if not exists fit_note text;

comment on column public.products.fit_note is
  'Referencia de talla junto al selector: estatura de la modelo y talla que usa.';
