-- ============================================================================
-- Lumane · 0070 · El pedido guarda a nombre de quién se hizo
-- ============================================================================
-- Una compra de prueba se hizo como «Mario Bernard» y los dos correos —el de
-- la clienta y el aviso a administración— decían «Ana Torres».
--
-- La causa: `confirm_online_order` busca la ficha de clienta por correo y, si
-- existe, la reutiliza tal cual. El nombre tecleado en ESE pago solo servía
-- para crear la ficha la primera vez; después se tiraba. La primera compra con
-- ese correo se hizo como «Ana Torres», y desde entonces todo pedido con ese
-- correo salía a su nombre. El pedido no guardaba el nombre en ningún sitio.
--
-- **No se arregla actualizando la ficha.** El pago no exige iniciar sesión:
-- si cada pedido sobrescribiera el nombre de la ficha, cualquiera podría
-- renombrar la cuenta de otra persona tecleando su correo. La ficha sigue
-- siendo de quien la creó; lo que se guarda es el contacto DE ESTE PEDIDO.
--
--   1. `orders.contact`: nombre, apellido, correo y teléfono tal como se
--      escribieron al pagar. NULL en los pedidos de mostrador (allí la
--      clienta la elige la cajera de la lista) y en los anteriores a esto.
--   2. `confirm_online_order` lo rellena. Es la 0059 sin más cambio que la
--      columna nueva en el INSERT.
--   3. `order_email_payload` (los dos correos) y `list_staff_orders` (la lista
--      de Pedidos de la tablet) usan el contacto del pedido si existe, y la
--      ficha si no. La búsqueda de la tablet encuentra por cualquiera de los
--      dos nombres.
--
-- Los pedidos ya hechos no se pueden corregir: el nombre que se tecleó nunca
-- se guardó. Siguen saliendo con el de la ficha.
-- ============================================================================

alter table public.orders add column contact jsonb;

comment on column public.orders.contact is
  'Quién hizo el pedido en línea, tal como lo escribió al pagar: first_name, last_name, email, phone. '
  'Manda sobre la ficha de customers al mostrar el pedido; la ficha no se sobrescribe (el pago no exige sesión).';

-- ---------------------------------------------------------------------------
-- confirm_online_order: igual que antes + `contact` en el INSERT del pedido.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_online_order(
  p_cart_token text default null::text,
  p_email text default null::text,
  p_first_name text default null::text,
  p_last_name text default null::text,
  p_phone text default null::text,
  p_shipping_address jsonb default null::jsonb,
  p_shipping_method_code text default null::text,
  p_payment jsonb default null::jsonb,
  p_distance_meters integer default null::integer,
  p_coupon_code text default null::text,
  p_note text default null::text,
  p_accepts_marketing boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  c public.carts%rowtype;
  v_customer_id uuid;
  v_location uuid;
  v_lines jsonb;
  v_totals jsonb;
  v_order public.orders%rowtype;
  v_provider_payment_id text := p_payment ->> 'provider_payment_id';
  v_paid_cents bigint := (p_payment ->> 'amount_cents')::bigint;
  v_payment_state text := coalesce(p_payment ->> 'status', 'succeeded');
  v_order_payment_status public.payment_status;
  v_coupon jsonb;
  v_method public.shipping_methods%rowtype;
  l jsonb;
  r record;
  v_position integer := 0;
begin
  if p_cart_token is null or p_payment is null or p_shipping_method_code is null then
    raise exception 'Faltan datos del pedido (carrito, pago o metodo de envio)'
      using errcode = 'invalid_parameter_value';
  end if;

  if v_provider_payment_id is not null then
    select o.* into v_order
    from public.orders o
    join public.payments pay on pay.order_id = o.id
    where pay.provider_payment_id = v_provider_payment_id;

    if found then
      return jsonb_build_object(
        'order_id', v_order.id, 'order_number', v_order.order_number,
        'guest_token', v_order.guest_token, 'already_processed', true
      );
    end if;
  end if;

  select * into c from public.carts where token = p_cart_token;
  if not found then
    raise exception 'Carrito no encontrado' using errcode = 'no_data_found';
  end if;

  v_location := private.default_location_id();
  v_lines := private.cart_lines_json(c.id);

  if jsonb_array_length(v_lines) = 0 then
    raise exception 'La bolsa esta vacia' using errcode = 'check_violation';
  end if;

  v_customer_id := c.customer_id;
  if v_customer_id is null and p_email is not null then
    select id into v_customer_id from public.customers
    where email = p_email and archived_at is null;
  end if;
  if v_customer_id is null then
    insert into public.customers (first_name, last_name, email, phone, created_via, accepts_marketing)
    values (coalesce(p_first_name, 'Clienta'), p_last_name, p_email, p_phone, 'online', p_accepts_marketing)
    returning id into v_customer_id;
  end if;

  v_totals := private.compute_totals(
    v_lines, 'online', v_customer_id, p_coupon_code, p_shipping_method_code, p_distance_meters, 0
  );
  v_coupon := v_totals -> 'coupon';

  if v_paid_cents is distinct from (v_totals ->> 'total_cents')::bigint then
    raise exception 'El importe (%) no coincide con el total del pedido (%)',
      v_paid_cents, (v_totals ->> 'total_cents')::bigint
      using errcode = 'check_violation';
  end if;

  if p_shipping_method_code is not null
     and (v_totals ->> 'shipping_available') = 'false' then
    raise exception 'El metodo de envio elegido no esta disponible para esa direccion'
      using errcode = 'check_violation';
  end if;

  v_order_payment_status := case
    when v_payment_state = 'succeeded' then 'paid'
    else 'pending'
  end;

  select * into v_method from public.shipping_methods where code = p_shipping_method_code;

  insert into public.orders (
    channel, location_id, customer_id, status, payment_status,
    subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents,
    coupon_id, shipping_address, shipping_method_snapshot, note, guest_token,
    contact
  ) values (
    'online', v_location, v_customer_id, 'placed', v_order_payment_status,
    (v_totals ->> 'subtotal_cents')::bigint,
    (v_totals ->> 'discount_cents')::bigint,
    (v_totals ->> 'shipping_cents')::bigint,
    (v_totals ->> 'tax_cents')::bigint,
    (v_totals ->> 'total_cents')::bigint,
    case when (v_coupon ->> 'valid')::boolean then (v_coupon ->> 'coupon_id')::uuid end,
    p_shipping_address,
    case when v_method.id is not null then to_jsonb(v_method) end,
    p_note,
    encode(extensions.gen_random_bytes(16), 'hex'),
    -- Lo que se tecleó en ESTE pago. Ver el encabezado: la ficha no se toca.
    jsonb_strip_nulls(jsonb_build_object(
      'first_name', nullif(btrim(p_first_name), ''),
      'last_name',  nullif(btrim(p_last_name), ''),
      'email',      nullif(btrim(p_email), ''),
      'phone',      nullif(btrim(p_phone), '')
    ))
  ) returning * into v_order;

  update public.orders set placed_at = now() where id = v_order.id;

  for l in select * from jsonb_array_elements(v_lines)
  loop
    v_position := v_position + 1;
    insert into public.order_lines (
      order_id, variant_id, product_id, sku, product_name, variant_title,
      unit_price_cents, cost_cents, tax_rate, quantity, total_cents, tax_cents, position
    ) values (
      v_order.id,
      (l ->> 'variant_id')::uuid,
      (l ->> 'product_id')::uuid,
      l ->> 'sku',
      l ->> 'product_name',
      coalesce(l ->> 'variant_title', ''),
      (l ->> 'unit_price_cents')::bigint,
      (l ->> 'cost_cents')::bigint,
      (l ->> 'tax_rate')::numeric,
      (l ->> 'quantity')::integer,
      (l ->> 'line_total_cents')::bigint,
      private.extract_tax_cents((l ->> 'line_total_cents')::bigint, (l ->> 'tax_rate')::numeric),
      v_position
    );
  end loop;

  for r in
    select variant_id, sum(quantity)::integer as quantity
    from public.inventory_reservations
    where cart_id = c.id and status = 'active'
    group by variant_id
    order by variant_id
  loop
    update public.inventory_levels
    set reserved = greatest(reserved - r.quantity, 0), updated_at = now()
    where variant_id = r.variant_id and location_id = v_location;
  end loop;

  update public.inventory_reservations
  set status = 'consumed', order_id = v_order.id, released_at = now()
  where cart_id = c.id and status = 'active';

  insert into public.inventory_movements
    (variant_id, location_id, type, quantity_delta, unit_cost_cents, reference_type, reference_id)
  select ol.variant_id, v_location, 'sale', -ol.quantity, ol.cost_cents, 'order', v_order.id
  from public.order_lines ol
  where ol.order_id = v_order.id and ol.variant_id is not null
  order by ol.variant_id;

  insert into public.payments
    (order_id, method, amount_cents, reference, provider, provider_payment_id, status)
  values (
    v_order.id,
    coalesce((p_payment ->> 'method')::public.payment_method, 'stripe'),
    v_paid_cents,
    p_payment ->> 'reference',
    p_payment ->> 'provider',
    v_provider_payment_id,
    v_payment_state
  );

  if (v_coupon ->> 'valid')::boolean then
    insert into public.coupon_redemptions (coupon_id, order_id, customer_id, amount_cents)
    values (
      (v_coupon ->> 'coupon_id')::uuid, v_order.id, v_customer_id,
      (v_totals ->> 'discount_cents')::bigint
    );
    update public.coupons set times_used = times_used + 1
    where id = (v_coupon ->> 'coupon_id')::uuid;
  end if;

  update public.carts set status = 'converted' where id = c.id;

  if p_accepts_marketing and p_email is not null then
    insert into public.newsletter_subscribers (email, customer_id, source)
    values (p_email, v_customer_id, 'checkout')
    on conflict (email) do nothing;
  end if;

  return jsonb_build_object(
    'order_id',     v_order.id,
    'order_number', v_order.order_number,
    'guest_token',  v_order.guest_token,
    'customer_id',  v_customer_id,
    'payment_status', v_order_payment_status,
    'totals',       v_totals,
    'already_processed', false
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- order_email_payload: `customer` sale del contacto del pedido si lo hay.
-- Lo usan el correo a la clienta y, envuelto, el aviso a administración.
-- ---------------------------------------------------------------------------
create or replace function public.order_email_payload(p_order_id uuid)
returns jsonb
language sql
stable security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'order', jsonb_build_object(
      'id',              o.id,
      'number',          o.order_number,
      'status',          o.status,
      'payment_status',  o.payment_status,
      'channel',         o.channel,
      'placed_at',       o.placed_at,
      'currency',        o.currency,
      'subtotal_cents',  o.subtotal_cents,
      'discount_cents',  o.discount_cents,
      'shipping_cents',  o.shipping_cents,
      'tax_cents',       o.tax_cents,
      'total_cents',     o.total_cents,
      'shipping_address', o.shipping_address,
      'shipping_method', o.shipping_method_snapshot,
      'note',            o.note
    ),
    'customer', coalesce(
      case when o.contact ? 'first_name' or o.contact ? 'email' then
        jsonb_build_object(
          'first_name', o.contact ->> 'first_name',
          'last_name',  o.contact ->> 'last_name',
          'email',      o.contact ->> 'email'
        )
      end,
      (
        select jsonb_build_object(
          'first_name', c.first_name,
          'last_name',  c.last_name,
          'email',      c.email::text
        )
        from public.customers c
        where c.id = o.customer_id
      )
    ),
    'lines', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'product_name',     l.product_name,
            'variant_title',    l.variant_title,
            'sku',              l.sku,
            'quantity',         l.quantity,
            'unit_price_cents', l.unit_price_cents,
            'total_cents',      l.total_cents
          ) order by l.position
        ),
        '[]'::jsonb
      )
      from public.order_lines l
      where l.order_id = o.id
    ),
    'payments', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'method',         p.method,
            'amount_cents',   p.amount_cents,
            'tendered_cents', p.tendered_cents,
            'change_cents',   p.change_cents,
            'reference',      p.reference
          ) order by p.created_at
        ),
        '[]'::jsonb
      )
      from public.payments p
      where p.order_id = o.id and p.amount_cents > 0
    ),
    'change_cents', (select coalesce(sum(p.change_cents), 0)
                     from public.payments p where p.order_id = o.id),
    'shipment', (
      select jsonb_build_object(
        'carrier',         s.carrier,
        'tracking_number', s.tracking_number,
        'tracking_url',    s.tracking_url,
        'shipped_at',      s.shipped_at
      )
      from public.shipments s
      where s.order_id = o.id
      order by s.created_at desc
      limit 1
    ),
    'location', (
      select jsonb_build_object('name', l.name, 'code', l.code,
                                'address', l.address, 'phone', l.phone)
      from public.locations l where l.id = o.location_id
    ),
    'cashier', (
      select jsonb_build_object('full_name', pr.full_name)
      from public.profiles pr where pr.id = o.created_by
    ),
    'store', (
      select jsonb_build_object(
        'name',          st.store_name,
        'contact_email', st.contact_email,
        'contact_phone', st.contact_phone,
        'whatsapp',      st.whatsapp_number,
        'hours',         st.opening_hours,
        'copyright',     st.copyright_text
      )
      from public.store_settings st
      limit 1
    )
  )
  from public.orders o
  where o.id = p_order_id;
$function$;

-- ---------------------------------------------------------------------------
-- list_staff_orders: la lista de Pedidos de la tablet, con el mismo criterio.
-- `id` sigue siendo el de la ficha: es lo que abre el historial de la clienta.
-- ---------------------------------------------------------------------------
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
