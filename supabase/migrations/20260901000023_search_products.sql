-- ============================================================================
-- Lumane · 0023 · Búsqueda y filtrado del catálogo
-- ============================================================================
-- Un solo RPC resuelve el catálogo, la página de rebajas, las landings de
-- categoría y colección, y el buscador. Las cuatro son la misma consulta con
-- distintos filtros; tenerlas separadas garantizaría que se comportaran
-- distinto con el tiempo.
--
-- Devuelve las piezas de la página PEDIDA, el total para la paginación, y los
-- CONTEURS DE FACETAS que el prototipo muestra junto a cada filtro —"Vestidos
-- (18)"—. Esos conteos se calculan sobre el resto de filtros activos pero
-- ignorando el propio: si no, al elegir "Vestidos" todas las demás categorías
-- mostrarían cero y no habría forma de cambiar de idea.
--
-- SECURITY INVOKER a propósito: la política `products_public_read` ya limita
-- lo visible a lo publicado. Ponerlo en DEFINER saltaría RLS sin necesidad.
-- ============================================================================

create or replace function public.search_products(
  p_query           text default null,
  p_category_slug   text default null,
  p_collection_slug text default null,
  p_sizes           text[] default null,
  p_colors          text[] default null,
  p_on_sale         boolean default false,
  p_in_stock_only   boolean default false,
  -- featured | newest | price_asc | price_desc | discount
  p_sort            text default 'featured',
  p_limit           integer default 9,
  p_offset          integer default 0
)
returns jsonb
language sql
stable
set search_path = ''
as $$
with
-- Variante más barata de cada producto: es el precio que muestra la tarjeta
-- ("desde"), y su `compare_at` es el que da el porcentaje de descuento. Tomar
-- min() de cada columna por separado mezclaría el precio de una talla con el
-- descuento de otra y pintaría un porcentaje falso.
cheapest as (
  select distinct on (v.product_id)
    v.product_id, v.price_cents, v.compare_at_price_cents
  from public.product_variants v
  where v.is_active
  order by v.product_id, v.price_cents asc
),
availability as (
  select v.product_id, sum(coalesce(il.available, 0))::integer as available
  from public.product_variants v
  left join public.inventory_levels il on il.variant_id = v.id
  where v.is_active
  group by v.product_id
),
-- Todo filtrado MENOS la categoría: esta es la base de los conteos de faceta.
matched as (
  select
    p.id, p.slug, p.name, p.short_description, p.published_at,
    c.price_cents, c.compare_at_price_cents,
    coalesce(a.available, 0) as available
  from public.products p
  join cheapest c on c.product_id = p.id
  left join availability a on a.product_id = p.id
  where
    (
      p_query is null or btrim(p_query) = ''
      or p.search_vector @@ plainto_tsquery('spanish', private.f_unaccent(p_query))
      -- Coincidencia parcial: "enca" encuentra "Vestido Encaje Negro" antes de
      -- que se termine de escribir la palabra.
      or private.f_unaccent(p.name) ilike '%' || private.f_unaccent(p_query) || '%'
      -- Y trigram por PALABRA para los errores de tecleo que el tsvector no
      -- perdona: letras de más o de menos ("vestidoo", "vestid").
      -- `word_similarity` compara la búsqueda contra la mejor palabra del
      -- nombre, no contra el nombre entero: sobre "Vestido Encaje Negro" una
      -- comparación global siempre saldría baja.
      -- Las TRANSPOSICIONES ("camsia" por "camisa") no las cubre: comparten un
      -- solo trigrama y bajar el umbral para atraparlas llenaría de ruido el
      -- resto de búsquedas. Ese caso lo resolverá el autocompletado.
      or extensions.word_similarity(
           private.f_unaccent(p_query), private.f_unaccent(p.name)
         ) > 0.6
      -- Búsqueda por SKU: la usa el POS con el escáner y el buscador de la web.
      or exists (
        select 1 from public.product_variants sv
        where sv.product_id = p.id
          and (sv.sku ilike '%' || p_query || '%' or sv.barcode = btrim(p_query))
      )
    )
    and (
      p_collection_slug is null
      or exists (
        select 1 from public.product_collections pc
        join public.collections col on col.id = pc.collection_id
        where pc.product_id = p.id and col.slug = p_collection_slug
      )
    )
    and (
      p_sizes is null or cardinality(p_sizes) = 0
      or exists (
        select 1
        from public.product_variants v2
        join public.variant_option_values vov on vov.variant_id = v2.id
        join public.product_option_values pov on pov.id = vov.option_value_id
        join public.product_options po on po.id = pov.option_id
        where v2.product_id = p.id and v2.is_active
          and po.name = 'Talla' and pov.value = any (p_sizes)
      )
    )
    and (
      p_colors is null or cardinality(p_colors) = 0
      or exists (
        select 1
        from public.product_variants v3
        join public.variant_option_values vov on vov.variant_id = v3.id
        join public.product_option_values pov on pov.id = vov.option_value_id
        join public.product_options po on po.id = pov.option_id
        where v3.product_id = p.id and v3.is_active
          and po.name = 'Color' and pov.value = any (p_colors)
      )
    )
    and (not p_on_sale or c.compare_at_price_cents is not null)
    and (not p_in_stock_only or coalesce(a.available, 0) > 0)
),
in_category as (
  select m.*
  from matched m
  where p_category_slug is null
    or exists (
      select 1 from public.product_categories pc
      join public.categories cat on cat.id = pc.category_id
      where pc.product_id = m.id and cat.slug = p_category_slug
    )
),
page as (
  select
    ic.*,
    img.storage_path as image_path,
    img.alt_text     as image_alt
  from in_category ic
  left join lateral (
    select pi.storage_path, pi.alt_text
    from public.product_images pi
    where pi.product_id = ic.id
    order by pi.position
    limit 1
  ) img on true
  order by
    case when p_sort = 'price_asc'  then ic.price_cents end asc nulls last,
    case when p_sort = 'price_desc' then ic.price_cents end desc nulls last,
    case
      when p_sort = 'discount' and ic.compare_at_price_cents is not null
      then (ic.compare_at_price_cents - ic.price_cents)::numeric / ic.compare_at_price_cents
    end desc nulls last,
    -- "Destacados" es hoy lo más reciente. Cuando la boutique quiera un orden
    -- propio, se añade una columna de posición y se cambia solo esta rama.
    case when p_sort in ('featured', 'newest') then ic.published_at end desc nulls last,
    ic.name
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0)
)
select jsonb_build_object(
  'items', coalesce((
    select jsonb_agg(to_jsonb(pg) order by pg.ord)
    from (select page.*, row_number() over () as ord from page) pg
  ), '[]'::jsonb),

  'total', (select count(*) from in_category),

  'facets', jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object('slug', cat.slug, 'name', cat.name, 'count', t.n)
        order by cat.position
      )
      from (
        select pc.category_id, count(distinct m.id) as n
        from matched m
        join public.product_categories pc on pc.product_id = m.id
        group by pc.category_id
      ) t
      join public.categories cat on cat.id = t.category_id
      where cat.is_visible
    ), '[]'::jsonb),

    'sizes', coalesce((
      select jsonb_agg(jsonb_build_object('value', s.value, 'count', s.n) order by s.position)
      from (
        select pov.value, min(pov.position) as position, count(distinct m.id) as n
        from matched m
        join public.product_variants v on v.product_id = m.id and v.is_active
        join public.variant_option_values vov on vov.variant_id = v.id
        join public.product_option_values pov on pov.id = vov.option_value_id
        join public.product_options po on po.id = pov.option_id
        where po.name = 'Talla'
        group by pov.value
      ) s
    ), '[]'::jsonb),

    'colors', coalesce((
      select jsonb_agg(
        jsonb_build_object('value', c2.value, 'hex', c2.hex, 'count', c2.n)
        order by c2.position
      )
      from (
        select pov.value, min(pov.hex) as hex, min(pov.position) as position,
               count(distinct m.id) as n
        from matched m
        join public.product_variants v on v.product_id = m.id and v.is_active
        join public.variant_option_values vov on vov.variant_id = v.id
        join public.product_option_values pov on pov.id = vov.option_value_id
        join public.product_options po on po.id = pov.option_id
        where po.name = 'Color'
        group by pov.value
      ) c2
    ), '[]'::jsonb),

    'on_sale_count', (select count(*) from matched where compare_at_price_cents is not null)
  )
);
$$;

comment on function public.search_products(
  text, text, text, text[], text[], boolean, boolean, text, integer, integer
) is
  'Catálogo, rebajas, landings y buscador en una sola consulta. Devuelve piezas, total y conteos de faceta.';

grant execute on function public.search_products(
  text, text, text, text[], text[], boolean, boolean, text, integer, integer
) to anon, authenticated;
