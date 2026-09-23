-- ============================================================================
-- Lumane · 0055 · Buscar en el inventario desde el mostrador
-- ============================================================================
-- Los tres RPC que MUEVEN inventario —`adjust_inventory`, `receive_stock` y
-- `apply_stock_count`— están escritos, probados y concedidos a `authenticated`
-- desde la migración 0018. Lo único que faltaba para tener pantalla era poder
-- LEER la lista.
--
-- `v_stock_alerts` ya existe, pero solo devuelve lo que está agotado o por
-- agotarse: sirve para el aviso del índice, no para una pantalla donde la
-- propietaria busca «el vestido negro» para corregir sus existencias.
--
-- Se parece a `pos_search_variants` y no se reutiliza aquella a propósito: la
-- de venta filtra por lo vendible —variante activa, producto publicado— porque
-- ofrecer en el mostrador algo que no se puede cobrar es un callejón sin
-- salida. Inventario necesita justo lo contrario: ver TODO, incluido lo
-- archivado y lo agotado, que es donde suelen estar los errores que se vienen
-- a arreglar.
-- ============================================================================

create or replace function public.list_inventory(
  p_search   text    default null,
  p_low_only boolean default false,
  p_limit    integer default 60,
  p_offset   integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_location uuid;
  v_busca    text := nullif(btrim(coalesce(p_search, '')), '');
  v_items    jsonb;
begin
  if not private.has_permission('inventory.read') then
    raise exception 'No tienes permiso para consultar el inventario'
      using errcode = 'insufficient_privilege';
  end if;

  v_location := private.current_location_id();

  select coalesce(jsonb_agg(fila order by fila.product_name, fila.position), '[]'::jsonb)
  into v_items
  from (
    select v.id            as variant_id,
           v.title         as variant_title,
           v.sku,
           v.barcode,
           v.position,
           v.price_cents,
           v.is_active,
           v.low_stock_threshold,
           v.bin_location,
           p.id            as product_id,
           p.name          as product_name,
           p.status::text  as product_status,
           coalesce(l.on_hand, 0)   as on_hand,
           coalesce(l.reserved, 0)  as reserved,
           coalesce(l.available, 0) as available,
           (select i.storage_path from public.product_images i
            where i.product_id = p.id order by i.position limit 1) as image_path
    from public.product_variants v
    join public.products p on p.id = v.product_id
    left join public.inventory_levels l
      on l.variant_id = v.id and l.location_id = v_location
    where
      -- Sin texto, la pantalla abre con lo que reclama atención. Con texto,
      -- busca en todo: el filtro de «bajo mínimo» se convierte en un chip que
      -- la propietaria enciende y apaga.
      (
        not p_low_only
        or coalesce(l.available, 0) <= greatest(v.low_stock_threshold, 0)
      )
      and (
        v_busca is null
        or v.sku     ilike '%' || v_busca || '%'
        or v.barcode  =     v_busca
        or p.name    ilike '%' || v_busca || '%'
        or v.title   ilike '%' || v_busca || '%'
      )
    order by p.name, v.position
    limit greatest(1, least(p_limit, 200))
    offset greatest(0, p_offset)
  ) as fila;

  return jsonb_build_object(
    'items', v_items,
    'location_id', v_location,
    -- El total sirve para decir «45 de 380», que es lo que orienta durante un
    -- conteo físico. Se cuenta aparte porque el listado va paginado.
    'total', (
      select count(*)
      from public.product_variants v
      join public.products p on p.id = v.product_id
      left join public.inventory_levels l
        on l.variant_id = v.id and l.location_id = v_location
      where (not p_low_only or coalesce(l.available, 0) <= greatest(v.low_stock_threshold, 0))
        and (
          v_busca is null
          or v.sku    ilike '%' || v_busca || '%'
          or v.barcode =     v_busca
          or p.name   ilike '%' || v_busca || '%'
          or v.title  ilike '%' || v_busca || '%'
        )
    )
  );
end;
$$;

comment on function public.list_inventory(text, boolean, integer, integer) is
  'Inventario de la sucursal con búsqueda. A diferencia de pos_search_variants, enseña también lo archivado y lo agotado.';

revoke execute on function public.list_inventory(text, boolean, integer, integer) from public, anon;
grant  execute on function public.list_inventory(text, boolean, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Las dos vistas que ya existían y que nadie podía leer desde la tablet.
--
-- Son `security_invoker`, así que aplican la RLS de quien consulta: las
-- políticas de `inventory_levels` y `products` siguen decidiendo. El `grant`
-- solo abre la puerta; lo que se ve al otro lado no cambia.
-- ---------------------------------------------------------------------------
grant select on public.v_stock_alerts        to authenticated;
grant select on public.v_inventory_valuation to authenticated;
