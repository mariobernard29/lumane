-- ============================================================================
-- Lumane · 0024 · Corrección: search_products no podía ejecutarse como anon
-- ============================================================================
-- BUG: la migración 0023 dejó `search_products` como SECURITY INVOKER para que
-- RLS filtrara lo publicado. Pero la función usa `private.f_unaccent`, y el
-- esquema `private` tiene revocado el USAGE para `anon` y `authenticated`
-- (migración 0001, y con razón: no debe ser API pública).
--
-- Resultado: la función reventaba con "permission denied for schema private"
-- en cada visita anónima. El catálogo se veía VACÍO, no roto.
--
-- CORRECCIÓN: pasa a SECURITY DEFINER —el dueño sí alcanza `private`— y los
-- predicados de visibilidad se escriben EXPLÍCITAMENTE en la consulta, porque
-- un DEFINER salta RLS y ya no puede apoyarse en `products_public_read`:
--
--     p.status = 'active' and p.is_online
--
-- Sin esa línea, la función publicaría los borradores del catálogo.
--
-- Lección aparte: el `catch` de la consulta devolvía un catálogo vacío sin
-- registrar nada, así que un fallo de permisos y "no hay coincidencias" se
-- veían igual en pantalla. Ahora se traza el error (`lib/queries/catalog.ts`).
-- ============================================================================

create or replace function public.search_products(
  p_query           text default null,
  p_category_slug   text default null,
  p_collection_slug text default null,
  p_sizes           text[] default null,
  p_colors          text[] default null,
  p_on_sale         boolean default false,
  p_in_stock_only   boolean default false,
  p_sort            text default 'featured',
  p_limit           integer default 9,
  p_offset          integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with
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
matched as (
  select
    p.id, p.slug, p.name, p.short_description, p.published_at,
    c.price_cents, c.compare_at_price_cents,
    coalesce(a.available, 0) as available
  from public.products p
  join cheapest c on c.product_id = p.id
  left join availability a on a.product_id = p.id
  where
    -- Visibilidad EXPLÍCITA: como SECURITY DEFINER esta función salta RLS.
    p.status = 'active' and p.is_online
    and (
      p_query is null or btrim(p_query) = ''
      or p.search_vector @@ plainto_tsquery('spanish', private.f_unaccent(p_query))
      or private.f_unaccent(p.name) ilike '%' || private.f_unaccent(p_query) || '%'
      or extensions.word_similarity(
           private.f_unaccent(p_query), private.f_unaccent(p.name)
         ) > 0.6
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
        where pc.product_id = p.id and col.slug = p_collection_slug and col.is_visible
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
      where pc.product_id = m.id and cat.slug = p_category_slug and cat.is_visible
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
