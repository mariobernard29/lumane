-- ===========================================================================
-- Colecciones públicas y búsquedas populares
--
-- Dos huecos que quedaban del prototipo: la página /colecciones y la de
-- /buscar. Ninguna necesita lógica nueva —`search_products` ya acepta
-- `p_collection_slug` y `p_query`—, pero sí necesitan dos cosas que hoy no
-- existen en la base: el conteo de piezas de cada colección y los chips de
-- búsquedas populares.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Texto alternativo del banner
--
-- `image_path` es la foto de la tarjeta y `banner_path` la del encabezado de
-- la landing: son dos fotografías distintas y describir una con el alt de la
-- otra es peor que no describirla. Se separa el texto.
-- ---------------------------------------------------------------------------
alter table public.collections add column if not exists banner_alt text;

comment on column public.collections.banner_alt is
  'Texto alternativo de banner_path. Si falta, la web cae al de image_path.';

-- ---------------------------------------------------------------------------
-- 2. Colecciones publicadas, con su conteo de piezas
--
-- La tarjeta de /colecciones dice "17 piezas", y ese número tiene que ser el
-- número de piezas que la clienta va a encontrar al entrar: solo las activas y
-- publicadas en línea. Contarlo desde el cliente serían N+1 consultas y un
-- número que no cuadra con la retícula de la landing.
--
-- `security_invoker = on`: la vista no eleva privilegios. Quien la consulta ve
-- lo que sus políticas le dejan ver, igual que si escribiera el join a mano.
-- Los predicados explícitos están además de la RLS, no en su lugar: así el
-- conteo es el mismo lo pregunte quien lo pregunte —una cajera con sesión
-- abierta incluida— y no cambia con los permisos de quien mira.
-- ---------------------------------------------------------------------------
create or replace view public.v_public_collections
with (security_invoker = on) as
select
  c.id,
  c.name,
  c.slug,
  c.description,
  c.badge_label,
  c.image_path,
  c.image_alt,
  c.banner_path,
  c.banner_alt,
  c.position,
  c.seo_title,
  c.seo_description,
  count(distinct p.id) as product_count
from public.collections c
left join public.product_collections pc
       on pc.collection_id = c.id
left join public.products p
       on p.id = pc.product_id
      and p.status = 'active'
      and p.is_online
where c.is_visible
group by c.id;

comment on view public.v_public_collections is
  'Colecciones visibles con el número de piezas publicadas en cada una.';

grant select on public.v_public_collections to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Búsquedas populares
--
-- Los chips bajo el buscador. Viven en `banners` por la misma razón que la
-- franja de servicios: son contenido editable desde el POS, no código. `title`
-- es la etiqueta y `cta_href` el destino; `image_alt` va vacío porque aquí no
-- hay imagen que describir.
-- ---------------------------------------------------------------------------
insert into public.banners (slot_key, title, cta_href, image_alt, position, is_active)
values
  ('search_popular', 'Vestidos',           '/catalogo/vestidos',            '', 1, true),
  ('search_popular', 'Sets',               '/catalogo/sets',                '', 2, true),
  ('search_popular', 'Bolsos',             '/catalogo/bolsos',              '', 3, true),
  ('search_popular', 'Rebajas',            '/rebajas',                      '', 4, true),
  ('search_popular', 'Primavera / Verano', '/colecciones/primavera-verano', '', 5, true),
  ('search_popular', 'Novedades',          '/catalogo?orden=novedades',     '', 6, true)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4. Alt del banner de la colección destacada
--
-- Es la única que hoy tiene `banner_path`, y tener banner es justo lo que la
-- convierte en la destacada de /colecciones.
-- ---------------------------------------------------------------------------
update public.collections
   set banner_alt = 'Mini vestido floral rosa de manga globo, fotografía de portada de la colección Primavera / Verano.'
 where slug = 'primavera-verano'
   and banner_path is not null;
