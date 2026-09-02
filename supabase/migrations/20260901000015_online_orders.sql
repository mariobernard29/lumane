-- ============================================================================
-- Lumane · 0015 · Reservas y confirmación del pedido online
-- ============================================================================
-- Aquí vive la garantía de que la tienda nunca vende una pieza que ya no está.
--
-- Bloqueo ORDENADO por variant_id: si dos checkouts simultáneos tocan las
-- mismas dos variantes, ambos las bloquean en el mismo orden y ninguno queda
-- esperando al otro en sentido contrario. Sin esto habría deadlocks los días
-- de rebajas, que es justo cuando no puede fallar.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Reserva del carrito al iniciar el pago.
-- ---------------------------------------------------------------------------
create or replace function public.reserve_cart_stock(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.carts%rowtype;
  v_location uuid;
  v_minutes integer;
  v_expires timestamptz;
  r record;
  v_reserved jsonb := '[]'::jsonb;
begin
  select * into c from public.carts
  where token = p_token and status = 'active' and expires_at > now();
  if not found then
    raise exception 'Carrito no encontrado' using errcode = 'no_data_found';
  end if;

  if not exists (select 1 from public.cart_lines where cart_id = c.id) then
    raise exception 'La bolsa está vacía' using errcode = 'check_violation';
  end if;

  v_location := private.default_location_id();
  select s.reservation_minutes into v_minutes from public.store_settings s where s.id;
  v_expires := now() + make_interval(mins => v_minutes);

  -- Una reserva previa del mismo carrito se libera antes de rehacerla: la
  -- clienta puede volver del checkout, cambiar la bolsa y reintentar.
  perform public.release_cart_reservations(c.id);

  -- ORDEN FIJO por variant_id → sin deadlocks entre checkouts concurrentes.
  for r in
    select cl.variant_id, cl.quantity
    from public.cart_lines cl
    where cl.cart_id = c.id
    order by cl.variant_id
  loop
    -- Bloquea la fila de inventario hasta el commit.
    perform 1 from public.inventory_levels il
    where il.variant_id = r.variant_id and il.location_id = v_location
    for update;

    -- El CHECK (on_hand - reserved >= 0) aborta aquí si alguien se adelantó.
    begin
      update public.inventory_levels
      set reserved = reserved + r.quantity, updated_at = now()
      where variant_id = r.variant_id and location_id = v_location;
    exception when check_violation then
      raise exception 'Ya no queda inventario suficiente de una de las piezas de tu bolsa'
        using errcode = 'check_violation', detail = r.variant_id::text;
    end;

    if not found then
      raise exception 'Esta pieza ya no está disponible'
        using errcode = 'no_data_found', detail = r.variant_id::text;
    end if;

    insert into public.inventory_reservations
      (variant_id, location_id, quantity, cart_id, expires_at)
    values (r.variant_id, v_location, r.quantity, c.id, v_expires);

    v_reserved := v_reserved || jsonb_build_object(
      'variant_id', r.variant_id, 'quantity', r.quantity
    );
  end loop;

  return jsonb_build_object(
    'cart_id',    c.id,
    'expires_at', v_expires,
    'reserved',   v_reserved
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Liberación de reservas de un carrito (checkout cancelado o rehecho).
-- ---------------------------------------------------------------------------
create or replace function public.release_cart_reservations(p_cart_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select id, variant_id, location_id, quantity
    from public.inventory_reservations
    where cart_id = p_cart_id and status = 'active'
    order by variant_id
  loop
    update public.inventory_levels
    set reserved = greatest(reserved - r.quantity, 0), updated_at = now()
    where variant_id = r.variant_id and location_id = r.location_id;

    update public.inventory_reservations
    set status = 'released', released_at = now()
    where id = r.id;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Barrido de reservas caducadas. Lo dispara pg_cron cada 5 minutos.
-- Devuelve al inventario lo que quedó atrapado en checkouts abandonados.
-- ---------------------------------------------------------------------------
create or replace function public.release_expired_reservations()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select id, variant_id, location_id, quantity
    from public.inventory_reservations
    where status = 'active' and expires_at <= now()
    order by variant_id
    for update skip locked
  loop
    update public.inventory_levels
    set reserved = greatest(reserved - r.quantity, 0), updated_at = now()
    where variant_id = r.variant_id and location_id = r.location_id;

    update public.inventory_reservations
    set status = 'released', released_at = now()
    where id = r.id;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

comment on function public.release_expired_reservations() is
  'Barrido de pg_cron: devuelve al inventario las reservas de checkouts abandonados.';

-- ---------------------------------------------------------------------------
-- Confirmación del pedido. La llama el webhook de Stripe con service_role.
--
-- Es idempotente por `provider_payment_id`: Stripe reintenta los webhooks, y
-- un reintento no puede crear un segundo pedido ni descontar el stock dos veces.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_online_order(
  p_cart_token           text,
  p_email                text,
  p_first_name           text,
  p_last_name            text,
  p_phone                text,
  p_shipping_address     jsonb,
  p_shipping_method_code text,
  p_payment              jsonb,
  p_distance_meters      integer default null,
  p_coupon_code          text default null,
  p_note                 text default null,
  p_accepts_marketing    boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.carts%rowtype;
  v_customer_id uuid;
  v_location uuid;
  v_lines jsonb;
  v_totals jsonb;
  v_order public.orders%rowtype;
  v_provider_payment_id text := p_payment ->> 'provider_payment_id';
  v_paid_cents bigint := (p_payment ->> 'amount_cents')::bigint;
  v_coupon jsonb;
  v_method public.shipping_methods%rowtype;
  l jsonb;
  r record;
  v_position integer := 0;
begin
  -- ---- Idempotencia -------------------------------------------------------
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
    raise exception 'La bolsa está vacía' using errcode = 'check_violation';
  end if;

  -- ---- Clienta: se reutiliza la que ya exista con ese correo --------------
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

  -- ---- Totales recalculados contra la base --------------------------------
  v_totals := private.compute_totals(
    v_lines, 'online', v_customer_id, p_coupon_code, p_shipping_method_code, p_distance_meters, 0
  );
  v_coupon := v_totals -> 'coupon';

  -- El importe cobrado DEBE coincidir con lo que la base calcula. Si no
  -- coincide, algo cambió entre el preview y el cobro: se aborta y se revisa.
  if v_paid_cents is distinct from (v_totals ->> 'total_cents')::bigint then
    raise exception 'El importe cobrado (%) no coincide con el total del pedido (%)',
      v_paid_cents, (v_totals ->> 'total_cents')::bigint
      using errcode = 'check_violation';
  end if;

  select * into v_method from public.shipping_methods where code = p_shipping_method_code;

  -- ---- Pedido -------------------------------------------------------------
  insert into public.orders (
    channel, location_id, customer_id, status, payment_status,
    subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents,
    coupon_id, shipping_address, shipping_method_snapshot, note,
    guest_token
  ) values (
    'online', v_location, v_customer_id, 'placed', 'paid',
    (v_totals ->> 'subtotal_cents')::bigint,
    (v_totals ->> 'discount_cents')::bigint,
    (v_totals ->> 'shipping_cents')::bigint,
    (v_totals ->> 'tax_cents')::bigint,
    (v_totals ->> 'total_cents')::bigint,
    case when (v_coupon ->> 'valid')::boolean then (v_coupon ->> 'coupon_id')::uuid end,
    p_shipping_address,
    case when v_method.id is not null then to_jsonb(v_method) end,
    p_note,
    encode(extensions.gen_random_bytes(16), 'hex')
  ) returning * into v_order;

  update public.orders set placed_at = now() where id = v_order.id;

  -- ---- Líneas con snapshot ------------------------------------------------
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

  -- ---- Inventario: la reserva se convierte en salida ----------------------
  -- Primero se suelta `reserved` y luego el movimiento baja `on_hand`. En ese
  -- orden el disponible nunca pasa por un valor negativo intermedio.
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

  -- ---- Pago ---------------------------------------------------------------
  insert into public.payments
    (order_id, method, amount_cents, reference, provider, provider_payment_id, status)
  values (
    v_order.id,
    coalesce((p_payment ->> 'method')::public.payment_method, 'stripe'),
    v_paid_cents,
    p_payment ->> 'reference',
    coalesce(p_payment ->> 'provider', 'stripe'),
    v_provider_payment_id,
    coalesce(p_payment ->> 'status', 'succeeded')
  );

  -- ---- Cupón --------------------------------------------------------------
  if (v_coupon ->> 'valid')::boolean then
    insert into public.coupon_redemptions (coupon_id, order_id, customer_id, amount_cents)
    values (
      (v_coupon ->> 'coupon_id')::uuid, v_order.id, v_customer_id,
      (v_totals ->> 'discount_cents')::bigint
    );
    update public.coupons set times_used = times_used + 1
    where id = (v_coupon ->> 'coupon_id')::uuid;
  end if;

  -- ---- Cierre del carrito -------------------------------------------------
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
    'totals',       v_totals,
    'already_processed', false
  );
end;
$$;

-- El webhook de Stripe corre con service_role. Nadie más confirma pedidos.
revoke execute on function public.confirm_online_order(
  text, text, text, text, text, jsonb, text, jsonb, integer, text, text, boolean
) from public, anon, authenticated;

grant execute on function public.reserve_cart_stock(text) to anon, authenticated;
revoke execute on function public.release_cart_reservations(uuid) from public, anon, authenticated;
revoke execute on function public.release_expired_reservations() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Consulta del pedido por una invitada, con el token que recibió por correo.
-- ---------------------------------------------------------------------------
create or replace function public.get_order_by_token(p_order_number text, p_guest_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.orders%rowtype;
begin
  select * into o from public.orders
  where order_number = p_order_number and guest_token = p_guest_token;
  if not found then
    raise exception 'Pedido no encontrado' using errcode = 'no_data_found';
  end if;

  return jsonb_build_object(
    'order', to_jsonb(o) - 'guest_token',
    'lines', (select coalesce(jsonb_agg(to_jsonb(ol) order by ol.position), '[]'::jsonb)
              from public.order_lines ol where ol.order_id = o.id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object(
                  'to_status', e.to_status, 'created_at', e.created_at
                ) order by e.created_at), '[]'::jsonb)
              from public.order_status_events e where e.order_id = o.id)
  );
end;
$$;

grant execute on function public.get_order_by_token(text, text) to anon, authenticated;
