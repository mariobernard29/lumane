-- ============================================================================
-- Lumane · 0073 · El tipo de entrega en las listas de pedidos
-- ============================================================================
-- «Enviado» (`shipped`) se lee distinto según cómo se entrega:
--
--   · paquetería ............ En camino, con guía
--   · entrega local ......... Salió de la sucursal, en reparto, sin guía
--   · recoger en boutique ... Listo para recoger, en mostrador
--
-- La ficha ya lo sabía (trae `shipping_method_snapshot` entero), pero las dos
-- listas no: la bandeja del POS y «Mis pedidos» de la web pintaban «En camino»
-- a un pedido que espera en el mostrador. Aquí solo se añade `shipping_kind`
-- a lo que devuelven; la máquina de estados no cambia.
-- ============================================================================

create or replace function public.list_staff_orders(
  p_channel public.order_channel default null::public.order_channel,
  p_status public.order_status[] default null::public.order_status[],
  p_search text default null::text,
  p_limit integer default 50,
  p_before timestamp with time zone default null::timestamp with time zone
)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_items jsonb;
  v_busca text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not private.has_permission('orders.read') then
    raise exception 'No tienes permiso para consultar pedidos' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(jsonb_agg(fila order by fila.placed_at desc), '[]'::jsonb)
  into v_items
  from (
    select o.id,
           o.order_number,
           o.channel,
           o.status,
           o.payment_status,
           o.total_cents,
           o.placed_at,
           o.created_at,
           (select count(*) from public.order_lines ol where ol.order_id = o.id) as line_count,
           (select jsonb_build_object(
                     'id', c.id,
                     'first_name', coalesce(o.contact ->> 'first_name', c.first_name),
                     'last_name',  case when o.contact ? 'first_name'
                                        then o.contact ->> 'last_name'
                                        else c.last_name end,
                     'email', coalesce(o.contact ->> 'email', c.email::text),
                     'phone', coalesce(o.contact ->> 'phone', c.phone))
            from public.customers c where c.id = o.customer_id) as customer,
           o.shipping_address ->> 'recipient' as recipient,
           o.shipping_method_snapshot ->> 'kind' as shipping_kind,
           (select s.tracking_number from public.shipments s
            where s.order_id = o.id order by s.created_at desc limit 1) as tracking_number
    from public.orders o
    where o.status <> 'draft'
      and (p_channel is null or o.channel = p_channel)
      and (p_status  is null or o.status  = any(p_status))
      and (p_before  is null or o.placed_at < p_before)
      and (
        v_busca is null
        or o.order_number ilike '%' || v_busca || '%'
        or ((o.contact ->> 'first_name') || ' ' || coalesce(o.contact ->> 'last_name', ''))
             ilike '%' || v_busca || '%'
        or exists (select 1 from public.customers c
                   where c.id = o.customer_id
                     and (c.first_name || ' ' || coalesce(c.last_name, '')) ilike '%' || v_busca || '%')
      )
    order by o.placed_at desc
    limit greatest(1, least(p_limit, 200))
  ) as fila;

  return jsonb_build_object(
    'items', v_items,
    'next_before', (select (v_items -> (jsonb_array_length(v_items) - 1) ->> 'placed_at')
                    where jsonb_array_length(v_items) >= greatest(1, least(p_limit, 200)))
  );
end;
$function$;

create or replace function public.get_my_orders(p_limit integer default 20)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(o order by o.placed_at desc nulls last), '[]'::jsonb)
  from (
    select
      ord.order_number,
      ord.status,
      ord.payment_status,
      ord.total_cents,
      ord.placed_at,
      ord.guest_token,
      ord.shipping_method_snapshot ->> 'kind' as shipping_kind,
      (select count(*) from public.order_lines ol where ol.order_id = ord.id)::integer as items,
      (select pi.storage_path
       from public.order_lines ol
       join public.product_images pi on pi.product_id = ol.product_id
       where ol.order_id = ord.id
       order by ol.position, pi.position
       limit 1) as image_path
    from public.orders ord
    where ord.customer_id = private.current_customer_id()
      and ord.status <> 'draft'
    order by ord.placed_at desc nulls last
    limit greatest(p_limit, 0)
  ) o;
$$;
