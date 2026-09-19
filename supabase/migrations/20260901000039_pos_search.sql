-- ============================================================================
-- Lumane · 0039 · Búsqueda del mostrador
-- ============================================================================
-- `search_products` no sirve aquí y no es cuestión de parámetros:
--
--   * Devuelve PRODUCTOS y el mostrador vende VARIANTES. La cajera no añade
--     "Vestido Encaje Negro", añade la talla M, que es la que tiene stock y
--     código de barras propios.
--   * Filtra por `is_online`. Una prenda que solo se vende en la boutique
--     existe para el mostrador y no para la web.
--   * No conoce el código de barras, que es el modo de búsqueda más usado.
--
-- Cuatro modos en una sola función, en el orden en que la cajera los usa:
-- código de barras (pistola o cámara), SKU, nombre y categoría.
-- ============================================================================

create or replace function public.pos_search_variants(
  p_query       text default null,
  p_location_id uuid default null,
  p_limit       integer default 40
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_location uuid;
  v_q        text := nullif(btrim(coalesce(p_query, '')), '');
  v_result   jsonb;
begin
  -- SECURITY DEFINER salta la RLS, así que el permiso se comprueba aquí. Sin
  -- esta guarda, cualquiera con una sesión podría listar el catálogo interno
  -- con sus costos… que no se devuelven, pero sí el inventario real.
  if not private.has_permission('inventory.read') then
    raise exception 'No tienes permiso para consultar el inventario'
      using errcode = 'insufficient_privilege';
  end if;

  v_location := coalesce(p_location_id, private.current_location_id());

  select coalesce(jsonb_agg(fila order by (fila ->> 'rank')::int desc, fila ->> 'product_name'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'variant_id',   v.id,
      'product_id',   p.id,
      'product_name', p.name,
      'variant_title', coalesce(v.title, ''),
      'sku',          v.sku,
      'barcode',      v.barcode,
      'price_cents',  v.price_cents,
      'image_path',   (select pi.storage_path
                       from public.product_images pi
                       where pi.product_id = p.id
                       order by pi.position
                       limit 1),
      'available',    coalesce(il.available, 0),
      'on_hand',      coalesce(il.on_hand, 0),
      -- El orden de los modos ES la prioridad. Un código de barras leído con
      -- la pistola tiene que caer arriba del todo aunque coincida por nombre
      -- con otras veinte prendas.
      'rank', case
        when v_q is null then 0
        when v.barcode = v_q then 100
        when upper(v.sku) = upper(v_q) then 90
        when upper(v.sku) like upper(v_q) || '%' then 70
        when p.search_vector @@ plainto_tsquery('spanish', private.f_unaccent(v_q)) then 50
        when private.f_unaccent(p.name) ilike '%' || private.f_unaccent(v_q) || '%' then 40
        when exists (
          select 1 from public.product_categories pc
          join public.categories c on c.id = pc.category_id
          where pc.product_id = p.id
            and private.f_unaccent(c.name) ilike '%' || private.f_unaccent(v_q) || '%'
        ) then 20
        else 0
      end
    ) as fila
    from public.product_variants v
    join public.products p on p.id = v.product_id
    left join public.inventory_levels il
           on il.variant_id = v.id and il.location_id = v_location
    where v.is_active
      -- `is_online` NO entra: el mostrador vende todo lo que esté activo.
      and p.status = 'active'
      and p.archived_at is null
      and (
        v_q is null
        or v.barcode = v_q
        or upper(v.sku) like upper(v_q) || '%'
        or p.search_vector @@ plainto_tsquery('spanish', private.f_unaccent(v_q))
        or private.f_unaccent(p.name) ilike '%' || private.f_unaccent(v_q) || '%'
        or exists (
          select 1 from public.product_categories pc
          join public.categories c on c.id = pc.category_id
          where pc.product_id = p.id
            and private.f_unaccent(c.name) ilike '%' || private.f_unaccent(v_q) || '%'
        )
      )
    order by p.name, v.position
    limit greatest(1, least(coalesce(p_limit, 40), 200))
  ) t;

  return v_result;
end;
$$;

comment on function public.pos_search_variants(text, uuid, integer) is
  'Busca variantes para el mostrador por código de barras, SKU, nombre o categoría, con su stock en la sucursal.';

revoke execute on function public.pos_search_variants(text, uuid, integer) from public, anon;
grant execute on function public.pos_search_variants(text, uuid, integer) to authenticated;
