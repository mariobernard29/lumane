-- ============================================================================
-- Lumane · 0051 · Dónde viven las imágenes
-- ============================================================================
-- `packages/db/src/storage.ts` declara tres buckets desde la Fase 0, con su
-- función de URL y transformación, y **ninguno existía**. Todas las imágenes
-- del sitio apuntan hoy a `/prototipo/*.webp`, servidas desde `public/` de
-- Next: se ven, pero no se pueden cambiar sin desplegar.
--
-- Los nombres y las rutas no se inventan aquí: son los que ese archivo ya
-- espera (`products/{product_id}/{uuid}.webp`, `content/{page_key}/{uuid}.webp`).
--
-- EL LÍMITE DE TAMAÑO Y LOS TIPOS SON LA VALIDACIÓN DE VERDAD. Lo que haga el
-- navegador antes de subir es cortesía: un `accept` en un input se salta con
-- la consola abierta, y el panel se va a usar desde una tablet donde cualquier
-- foto de cámara pesa cuatro megas.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- Fotografía de producto. Pública: la ve cualquiera que entre a la tienda.
  ('products', 'products', true, 5242880,
   array['image/webp', 'image/jpeg', 'image/png', 'image/avif']),
  -- Hero, banners e imágenes editoriales. Más margen porque una portada a
  -- ancho completo pesa más que la foto de una prenda.
  ('content', 'content', true, 10485760,
   array['image/webp', 'image/jpeg', 'image/png', 'image/avif']),
  -- Documentos internos. Privado y sin política: nadie lo usa todavía, y
  -- abrirlo «por si acaso» es superficie regalada. El día que haga falta se
  -- escribe su política junto con su caso de uso.
  ('documents', 'documents', false, 20971520, null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Quién lee: cualquiera, pero solo los dos buckets públicos.
-- ---------------------------------------------------------------------------
create policy objetos_publicos_lectura
  on storage.objects for select
  to anon, authenticated
  using (bucket_id in ('products', 'content'));

-- ---------------------------------------------------------------------------
-- Quién escribe: el mismo permiso que ya gobierna la tabla correspondiente.
--
-- Las fotos de producto van con `inventory.write`, que es quien puede editar
-- el catálogo; las del sitio con `cms.write`, que es quien puede editar el
-- contenido. Así una encargada puede cambiar la portada sin poder tocar
-- precios, que es exactamente la separación que los roles ya describían y que
-- hasta ahora no servía para nada porque no había qué escribir.
-- ---------------------------------------------------------------------------
create policy productos_personal_escritura
  on storage.objects for all
  to authenticated
  using (bucket_id = 'products' and (select private.has_permission('inventory.write')))
  with check (bucket_id = 'products' and (select private.has_permission('inventory.write')));

create policy contenido_personal_escritura
  on storage.objects for all
  to authenticated
  using (bucket_id = 'content' and (select private.has_permission('cms.write')))
  with check (bucket_id = 'content' and (select private.has_permission('cms.write')));
