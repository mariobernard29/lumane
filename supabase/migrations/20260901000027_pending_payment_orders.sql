-- ============================================================================
-- Lumane · 0027 · Pedidos con pago pendiente (transferencia bancaria)
-- ============================================================================
-- `confirm_online_order` fijaba `payment_status = 'paid'` siempre, porque nació
-- para el webhook de Stripe, que solo avisa cuando el cobro ya ocurrió.
--
-- Pero en México una parte grande de las compras se paga por transferencia o
-- SPEI: la clienta cierra el pedido y transfiere después. Ese pedido existe,
-- aparta las piezas y espera confirmación. Marcarlo como pagado sería mentir en
-- los reportes de la boutique.
--
-- Ahora el estado del pedido lo deriva `p_payment ->> 'status'`:
--   'succeeded' → payment_status = 'paid'   (Stripe confirmado)
--   cualquier otro → payment_status = 'pending'
--
-- El inventario SÍ se descuenta en ambos casos: la boutique aparta la prenda en
-- cuanto llega el pedido. Si la transferencia no llega, se cancela desde el POS
-- y la cancelación devuelve el stock.
-- ============================================================================

-- Todos los parámetros llevan DEFAULT y lo obligatorio se valida dentro.
-- Motivo: los tipos que genera Supabase marcan como `string` obligatorio todo
-- parámetro sin default, aunque la función acepte null. `p_last_name` y
-- `p_phone` son opcionales de verdad —hay clientas que solo dejan su correo— y
-- la firma tenía que decirlo. En SQL, una vez que un parámetro tiene default,
-- todos los siguientes también, así que se aplica a la lista entera.
create or replace function public.confirm_online_order(
  p_cart_token           text default null,
  p_email                text default null,
  p_first_name           text default null,
  p_last_name            text default null,
  p_phone                text default null,
  p_shipping_address     jsonb default null,
  p_shipping_method_code text default null,
  p_payment              jsonb default null,
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
  v_payment_state text := coalesce(p_payment ->> 'status', 'succeeded');
  v_order_payment_status public.payment_status;
  v_coupon jsonb;
  v_method public.shipping_methods%rowtype;
  l jsonb;
  r record;
  v_position integer := 0;
begin
  -- Lo que la firma ya no puede exigir, se exige aquí.
  if p_cart_token is null or p_payment is null or p_shipping_method_code is null then
    raise exception 'Faltan datos del pedido (carrito, pago o método de envío)'
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
    raise exception 'La bolsa está vacía' using errcode = 'check_violation';
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

  -- El importe DEBE coincidir con lo que la base calcula, se haya cobrado ya o
  -- esté por transferirse. Si no cuadra, algo cambió entre el resumen y el
  -- cierre y es preferible abortar que registrar un pedido con otro total.
  if v_paid_cents is distinct from (v_totals ->> 'total_cents')::bigint then
    raise exception 'El importe (%) no coincide con el total del pedido (%)',
      v_paid_cents, (v_totals ->> 'total_cents')::bigint
      using errcode = 'check_violation';
  end if;

  -- El método de envío elegido tiene que aplicar de verdad a esta dirección:
  -- sin esto, una entrega local fuera del radio de cobertura pasaría con
  -- costo de envío cero.
  if p_shipping_method_code is not null
     and (v_totals ->> 'shipping_available') = 'false' then
    raise exception 'El método de envío elegido no está disponible para esa dirección'
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
    coupon_id, shipping_address, shipping_method_snapshot, note, guest_token
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
    encode(extensions.gen_random_bytes(16), 'hex')
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
$$;

revoke execute on function public.confirm_online_order(
  text, text, text, text, text, jsonb, text, jsonb, integer, text, text, boolean
) from public, anon, authenticated;
