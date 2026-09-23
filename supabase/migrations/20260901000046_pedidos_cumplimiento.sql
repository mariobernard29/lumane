-- ============================================================================
-- Lumane · 0046 · Cumplimiento de pedidos desde el mostrador
-- ============================================================================
-- Hasta ahora, si entraba un pedido por la web nadie se enteraba desde la
-- tablet. Aquí van las cuatro piezas que faltaban: leer la bandeja, abrir un
-- pedido, mandarlo con su guía, y cancelarlo.
--
-- QUÉ **NO** HAY AQUÍ, a propósito: ninguna función para avanzar de `placed` a
-- `preparing` o de `shipped` a `delivered`. Esos pasos son un `update` directo
-- de una columna, la RLS ya los autoriza con `orders.fulfill`, los triggers de
-- la 0007 y la 0010 ya escriben la bitácora y emiten el correo, y la 0045 ya
-- impide los saltos ilegales. Un RPC ahí sería una cuarta capa repitiendo lo
-- que las otras tres hacen.
--
-- Los dos que SÍ son RPC lo son porque necesitan atomicidad, no autorización.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. La bandeja
--
-- Un solo listador para los dos usos: la bandeja de pedidos en línea
-- (`p_channel = 'online'`) y el historial de ventas del mostrador
-- (`p_channel = 'pos'`). Son la misma consulta con distinto filtro; partirla en
-- dos funciones daría dos sitios donde arreglar el mismo error.
--
-- Pagina por cursor sobre `placed_at` y no por `offset`: con `offset`, un
-- pedido que entra mientras la encargada pasa de página le empuja una fila y
-- se salta una venta sin enterarse.
-- ---------------------------------------------------------------------------
create or replace function public.list_staff_orders(
  p_channel public.order_channel   default null,
  p_status  public.order_status[]  default null,
  p_search  text                   default null,
  p_limit   integer                default 50,
  p_before  timestamptz            default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_items jsonb;
  v_busca text := nullif(btrim(coalesce(p_search, '')), '');
begin
  -- SECURITY DEFINER salta RLS, así que el permiso se comprueba aquí: sin esta
  -- guarda una clienta con sesión leería los pedidos de toda la boutique.
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
                     'first_name', c.first_name,
                     'last_name', c.last_name,
                     'email', c.email::text,
                     'phone', c.phone)
            from public.customers c where c.id = o.customer_id) as customer,
           -- El nombre de quien recibe puede diferir del de la clienta.
           o.shipping_address ->> 'recipient' as recipient,
           (select s.tracking_number from public.shipments s
            where s.order_id = o.id order by s.created_at desc limit 1) as tracking_number
    from public.orders o
    where o.status <> 'draft'                            -- carritos del POS en curso
      and (p_channel is null or o.channel = p_channel)
      and (p_status  is null or o.status  = any(p_status))
      and (p_before  is null or o.placed_at < p_before)
      and (
        v_busca is null
        or o.order_number ilike '%' || v_busca || '%'
        or exists (select 1 from public.customers c
                   where c.id = o.customer_id
                     and (c.first_name || ' ' || coalesce(c.last_name, '')) ilike '%' || v_busca || '%')
      )
    order by o.placed_at desc
    limit greatest(1, least(p_limit, 200))
  ) as fila;

  return jsonb_build_object(
    'items', v_items,
    -- El cursor de la siguiente página. Null cuando no quedan más.
    'next_before', (select (v_items -> (jsonb_array_length(v_items) - 1) ->> 'placed_at')
                    where jsonb_array_length(v_items) >= greatest(1, least(p_limit, 200)))
  );
end;
$$;

comment on function public.list_staff_orders(public.order_channel, public.order_status[], text, integer, timestamptz) is
  'Bandeja de pedidos en línea e historial de mostrador. Paginación por cursor.';

-- ---------------------------------------------------------------------------
-- 2. La ficha de cumplimiento
--
-- Nombre distinto de `get_pos_sale` a propósito: aquel es la venta de
-- mostrador y trae el cambio entregado; este es el pedido a preparar y trae la
-- dirección, el envío y la bitácora. Mezclarlos habría dado una función con
-- media respuesta nula según el canal.
-- ---------------------------------------------------------------------------
create or replace function public.get_staff_order(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.has_permission('orders.read') then
    raise exception 'No tienes permiso para consultar pedidos' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'order',    to_jsonb(o),
    'lines',    (select coalesce(jsonb_agg(to_jsonb(ol) order by ol.position), '[]'::jsonb)
                 from public.order_lines ol where ol.order_id = o.id),
    'payments', (select coalesce(jsonb_agg(to_jsonb(pay) order by pay.created_at), '[]'::jsonb)
                 from public.payments pay where pay.order_id = o.id),
    'customer', (select to_jsonb(c) from public.customers c where c.id = o.customer_id),
    'shipment', (select to_jsonb(s) from public.shipments s
                 where s.order_id = o.id order by s.created_at desc limit 1),
    'events',   (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]'::jsonb)
                 from public.order_status_events e where e.order_id = o.id),
    -- Lo ya devuelto por línea: la pantalla de devolución necesita saber
    -- cuánto queda antes de dejar teclear.
    'returned', (select coalesce(jsonb_object_agg(rl.order_line_id, rl.total), '{}'::jsonb)
                 from (select rl.order_line_id, sum(rl.quantity)::integer as total
                       from public.return_lines rl
                       join public.order_lines ol2 on ol2.id = rl.order_line_id
                       where ol2.order_id = o.id
                       group by rl.order_line_id) rl)
  ) into v_result
  from public.orders o
  where o.id = p_order_id;

  if v_result is null then
    raise exception 'Ese pedido no existe' using errcode = 'no_data_found';
  end if;

  return v_result;
end;
$$;

comment on function public.get_staff_order(uuid) is
  'Ficha de cumplimiento de un pedido: líneas, pagos, envío, bitácora y lo ya devuelto.';

-- ---------------------------------------------------------------------------
-- 3. Marcar enviado CON su guía
--
-- Esta es la razón de que sea un RPC y no un `update` más.
--
-- `order_email_payload` lee `shipments` en el momento en que el worker manda el
-- correo, y el cron corre CADA MINUTO. Si el estado pasara a `shipped` en una
-- operación y la guía se escribiera en otra, hay una ventana real en la que
-- sale «tu pedido va en camino» SIN número de rastreo. Ese correo no se puede
-- recoger: ya está en la bandeja de la clienta.
--
-- Efecto lateral que resuelve un bloqueo: `shipments` no tiene política de
-- escritura, así que hasta ahora solo `service_role` podía insertar ahí. Al ser
-- SECURITY DEFINER, esta función es el único camino de escritura — y valida
-- antes. Es menos superficie que abrirle una política `for all`.
-- ---------------------------------------------------------------------------
create or replace function public.pos_ship_order(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order    public.orders%rowtype;
  v_shipment public.shipments%rowtype;
  v_guia     text := nullif(btrim(coalesce(p_payload ->> 'tracking_number', '')), '');
begin
  if not private.has_permission('orders.fulfill') then
    raise exception 'No tienes permiso para despachar pedidos' using errcode = 'insufficient_privilege';
  end if;

  select * into v_order from public.orders
  where id = (p_payload ->> 'order_id')::uuid
  for update;

  if not found then
    raise exception 'Ese pedido no existe' using errcode = 'no_data_found';
  end if;

  -- Se comprueba aquí además del trigger para dar un mensaje útil: el de la
  -- 0045 habla de estados, este habla de lo que la encargada tiene delante.
  if v_order.status <> 'packed' then
    raise exception 'Solo se puede enviar un pedido empacado; este está en «%»', v_order.status
      using errcode = 'check_violation', hint = 'transicion_invalida';
  end if;

  -- Un envío por pedido: el esquema admite varios, pero esta boutique no hace
  -- envíos parciales. Se edita el más reciente si ya existe, para que corregir
  -- una guía mal tecleada no deje dos filas contradictorias.
  select * into v_shipment from public.shipments
  where order_id = v_order.id order by created_at desc limit 1;

  if found then
    update public.shipments
    set carrier            = coalesce(p_payload ->> 'carrier', carrier),
        tracking_number    = coalesce(v_guia, tracking_number),
        tracking_url       = coalesce(p_payload ->> 'tracking_url', tracking_url),
        shipping_method_id = coalesce((p_payload ->> 'shipping_method_id')::uuid, shipping_method_id),
        shipped_at         = coalesce(shipped_at, now()),
        updated_at         = now()
    where id = v_shipment.id;
  else
    insert into public.shipments
      (order_id, shipping_method_id, carrier, tracking_number, tracking_url, shipped_at)
    values (
      v_order.id,
      (p_payload ->> 'shipping_method_id')::uuid,
      p_payload ->> 'carrier',
      v_guia,
      p_payload ->> 'tracking_url',
      now()
    );
  end if;

  -- Y AHORA el estado, en la misma transacción. El trigger de la 0010 emitirá
  -- el evento de correo cuando esto se confirme, con la guía ya escrita.
  update public.orders set status = 'shipped' where id = v_order.id;

  return public.get_staff_order(v_order.id);
end;
$$;

comment on function public.pos_ship_order(jsonb) is
  'Escribe la guía y marca el pedido enviado en la MISMA transacción, para que el correo nunca salga sin rastreo.';

-- ---------------------------------------------------------------------------
-- 4. Cancelar
--
-- También RPC, y también por atomicidad: `confirm_online_order` consumió las
-- reservas y escribió el movimiento de salida del inventario. Nada lo revierte
-- hoy. Cancelar sin reintegrar dejaría piezas que la web cree vendidas y que
-- están colgadas en el perchero.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order  public.orders%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not private.has_permission('orders.fulfill') then
    raise exception 'No tienes permiso para cancelar pedidos' using errcode = 'insufficient_privilege';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Ese pedido no existe' using errcode = 'no_data_found';
  end if;

  -- Idempotente: cancelar dos veces devuelve lo mismo en vez de reintegrar el
  -- inventario por segunda vez. La tablet pierde el wifi y reintenta.
  if v_order.status = 'cancelled' then
    return public.get_staff_order(v_order.id);
  end if;

  -- Se reintegra lo que salió MENOS lo ya devuelto: si alguien registró una
  -- devolución parcial antes de cancelar, esas piezas ya volvieron al stock y
  -- contarlas otra vez inventaría mercancía que no existe.
  insert into public.inventory_movements
    (variant_id, location_id, type, quantity_delta, unit_cost_cents,
     reference_type, reference_id, note, created_by)
  select ol.variant_id,
         v_order.location_id,
         'return',
         ol.quantity - coalesce(
           (select sum(rl.quantity)::integer from public.return_lines rl
            where rl.order_line_id = ol.id), 0),
         ol.cost_cents,
         'order',
         v_order.id,
         coalesce('Cancelación: ' || v_motivo, 'Cancelación del pedido'),
         (select auth.uid())
  from public.order_lines ol
  where ol.order_id = v_order.id
    and ol.variant_id is not null
    and ol.quantity - coalesce(
          (select sum(rl.quantity)::integer from public.return_lines rl
           where rl.order_line_id = ol.id), 0) > 0
  order by ol.variant_id;

  -- El motivo se anexa, no se sobrescribe: la nota puede traer instrucciones
  -- de entrega que la clienta escribió al comprar.
  update public.orders
  set status       = 'cancelled',
      cancelled_at = now(),
      note         = case
                       when v_motivo is null then note
                       when note is null or btrim(note) = '' then 'Cancelado: ' || v_motivo
                       else note || E'\nCancelado: ' || v_motivo
                     end
  where id = v_order.id;

  return public.get_staff_order(v_order.id);
end;
$$;

comment on function public.cancel_order(uuid, text) is
  'Cancela un pedido reintegrando al inventario lo que salió y no se devolvió ya. Idempotente.';

-- ---------------------------------------------------------------------------
-- Permisos. Ninguna de las cuatro tiene nada que hacer sin sesión de personal,
-- y las cuatro son SECURITY DEFINER, así que dejarlas abiertas a `anon` sería
-- publicar la operación entera de la boutique.
-- ---------------------------------------------------------------------------
revoke execute on function public.list_staff_orders(public.order_channel, public.order_status[], text, integer, timestamptz) from public, anon;
revoke execute on function public.get_staff_order(uuid)      from public, anon;
revoke execute on function public.pos_ship_order(jsonb)      from public, anon;
revoke execute on function public.cancel_order(uuid, text)   from public, anon;

grant execute on function public.list_staff_orders(public.order_channel, public.order_status[], text, integer, timestamptz) to authenticated;
grant execute on function public.get_staff_order(uuid)       to authenticated;
grant execute on function public.pos_ship_order(jsonb)       to authenticated;
grant execute on function public.cancel_order(uuid, text)    to authenticated;
