-- ============================================================================
-- Lumane · 0013 · Motor de precios (cupones, envíos y totales)
-- ============================================================================
-- ESTA ES LA PIEZA QUE HACE QUE POS Y WEB SEAN "LA MISMA LÓGICA DE NEGOCIO".
--
-- El POS es React Native y no puede ejecutar Server Actions de Next.js. Si el
-- cálculo de totales viviera en el servidor web habría que escribirlo dos
-- veces, y dos implementaciones divergen siempre. Viviendo aquí, mostrador y
-- tienda cobran exactamente igual, por construcción.
--
-- REGLA DE ORO: el cliente nunca envía precios. Envía variant_id, cantidad y
-- código de cupón; estas funciones releen todo de la base.
--
-- IVA: los precios YA lo incluyen. El impuesto se DESGLOSA del total.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Costo de envío. Devuelve null si el método no existe o no aplica.
-- ---------------------------------------------------------------------------
create or replace function private.quote_shipping_cents(
  p_method_code    text,
  p_subtotal_cents bigint,
  p_distance_meters integer default null
)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  m public.shipping_methods%rowtype;
  v_km numeric;
  v_price bigint;
  v_free_over bigint;
begin
  select * into m from public.shipping_methods
  where code = p_method_code and is_active;

  if not found then
    return null;
  end if;

  -- Umbral de envío gratis: el del método, o el global de la tienda.
  select coalesce(m.free_over_cents, s.free_shipping_over_cents)
    into v_free_over
  from public.store_settings s where s.id;

  if m.kind = 'pickup' then
    return 0;
  end if;

  if m.kind = 'local_delivery' then
    if p_distance_meters is null then
      -- Sin distancia no hay tarifa: el checkout debe pedir la dirección antes.
      return null;
    end if;
    v_km := p_distance_meters::numeric / 1000.0;
    select r.price_cents into v_price
    from public.local_delivery_rates r
    where r.shipping_method_id = m.id
      and v_km >= r.min_km and v_km < r.max_km
    order by r.min_km
    limit 1;
    -- Fuera del radio de cobertura configurado.
    return v_price;
  end if;

  -- kind = 'flat'
  if v_free_over is not null and p_subtotal_cents >= v_free_over then
    return 0;
  end if;
  return m.price_cents;
end;
$$;

comment on function private.quote_shipping_cents(text, bigint, integer) is
  'Costo de envío según la configuración vigente. Null = el método no aplica a este pedido.';

-- ---------------------------------------------------------------------------
-- Evaluación de un cupón contra un conjunto de líneas.
--
-- p_lines: [{ "product_id": uuid, "line_total_cents": bigint }, ...]
--
-- Devuelve { valid, reason, coupon_id, code, discount_cents, free_shipping }.
-- NO consume el cupón: eso ocurre al confirmar el pedido.
-- ---------------------------------------------------------------------------
create or replace function private.evaluate_coupon(
  p_code        text,
  p_channel     public.order_channel,
  p_customer_id uuid,
  p_lines       jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.coupons%rowtype;
  v_subtotal bigint;
  v_eligible bigint;
  v_discount bigint := 0;
  v_used_by_customer integer;
begin
  if p_code is null or btrim(p_code) = '' then
    return jsonb_build_object('valid', false, 'reason', 'empty');
  end if;

  select * into c from public.coupons where code = btrim(p_code);

  if not found or not c.is_active then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;
  if c.starts_at is not null and c.starts_at > now() then
    return jsonb_build_object('valid', false, 'reason', 'not_started');
  end if;
  if c.ends_at is not null and c.ends_at <= now() then
    return jsonb_build_object('valid', false, 'reason', 'expired');
  end if;
  if not (p_channel::text = any (c.channels)) then
    return jsonb_build_object('valid', false, 'reason', 'wrong_channel');
  end if;
  if c.usage_limit_total is not null and c.times_used >= c.usage_limit_total then
    return jsonb_build_object('valid', false, 'reason', 'usage_limit_reached');
  end if;

  if c.usage_limit_per_customer is not null and p_customer_id is not null then
    select count(*) into v_used_by_customer
    from public.coupon_redemptions r
    where r.coupon_id = c.id and r.customer_id = p_customer_id;

    if v_used_by_customer >= c.usage_limit_per_customer then
      return jsonb_build_object('valid', false, 'reason', 'customer_limit_reached');
    end if;
  end if;

  select coalesce(sum((l ->> 'line_total_cents')::bigint), 0)
    into v_subtotal
  from jsonb_array_elements(p_lines) l;

  if v_subtotal < c.min_subtotal_cents then
    return jsonb_build_object(
      'valid', false, 'reason', 'below_minimum',
      'min_subtotal_cents', c.min_subtotal_cents
    );
  end if;

  -- Subtotal sobre el que el cupón puede actuar según su alcance.
  if c.scope = 'all' then
    v_eligible := v_subtotal;
  else
    select coalesce(sum((l ->> 'line_total_cents')::bigint), 0)
      into v_eligible
    from jsonb_array_elements(p_lines) l
    where exists (
      select 1 from public.coupon_targets t
      where t.coupon_id = c.id
        and t.target_type = c.scope
        and (
          (c.scope = 'products'    and t.target_id = (l ->> 'product_id')::uuid)
       or (c.scope = 'collections' and exists (
             select 1 from public.product_collections pc
             where pc.product_id = (l ->> 'product_id')::uuid
               and pc.collection_id = t.target_id))
       or (c.scope = 'categories'  and exists (
             select 1 from public.product_categories pcat
             where pcat.product_id = (l ->> 'product_id')::uuid
               and pcat.category_id = t.target_id))
        )
    );

    if v_eligible = 0 then
      return jsonb_build_object('valid', false, 'reason', 'no_eligible_items');
    end if;
  end if;

  if c.discount_type = 'percentage' then
    v_discount := round(v_eligible * c.percent_off / 100.0);
  elsif c.discount_type = 'fixed_amount' then
    v_discount := least(c.amount_off_cents, v_eligible);
  else
    v_discount := 0; -- free_shipping
  end if;

  return jsonb_build_object(
    'valid',          true,
    'coupon_id',      c.id,
    'code',           c.code,
    'discount_type',  c.discount_type,
    'discount_cents', v_discount,
    'free_shipping',  c.discount_type = 'free_shipping'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Núcleo del cálculo. Toma las líneas ya resueltas contra la base y devuelve
-- el desglose completo. Lo usan por igual el preview del checkout, la
-- confirmación del pedido online y la venta del POS.
--
-- p_lines: [{ product_id, line_total_cents }, ...] con precios de la BASE.
-- ---------------------------------------------------------------------------
create or replace function private.compute_totals(
  p_lines            jsonb,
  p_channel          public.order_channel,
  p_customer_id      uuid default null,
  p_coupon_code      text default null,
  p_shipping_method_code text default null,
  p_distance_meters  integer default null,
  p_manual_discount_cents bigint default 0
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_subtotal bigint;
  v_coupon jsonb;
  v_coupon_discount bigint := 0;
  v_discount bigint;
  v_shipping bigint := 0;
  v_shipping_quote bigint;
  v_tax_rate numeric;
  v_taxable bigint;
  v_tax bigint;
  v_total bigint;
begin
  select coalesce(sum((l ->> 'line_total_cents')::bigint), 0)
    into v_subtotal
  from jsonb_array_elements(p_lines) l;

  select s.tax_rate into v_tax_rate from public.store_settings s where s.id;

  v_coupon := private.evaluate_coupon(p_coupon_code, p_channel, p_customer_id, p_lines);
  if (v_coupon ->> 'valid')::boolean then
    v_coupon_discount := coalesce((v_coupon ->> 'discount_cents')::bigint, 0);
  end if;

  -- El descuento nunca puede superar el subtotal: un pedido no se paga solo.
  v_discount := least(v_coupon_discount + greatest(p_manual_discount_cents, 0), v_subtotal);

  if p_shipping_method_code is not null then
    v_shipping_quote := private.quote_shipping_cents(
      p_shipping_method_code, v_subtotal - v_discount, p_distance_meters
    );
    v_shipping := coalesce(v_shipping_quote, 0);
    if (v_coupon ->> 'valid')::boolean and (v_coupon ->> 'free_shipping')::boolean then
      v_shipping := 0;
    end if;
  end if;

  v_taxable := v_subtotal - v_discount + v_shipping;
  v_tax     := private.extract_tax_cents(v_taxable, v_tax_rate);
  v_total   := v_taxable;

  return jsonb_build_object(
    'subtotal_cents', v_subtotal,
    'discount_cents', v_discount,
    'shipping_cents', v_shipping,
    'tax_cents',      v_tax,
    'tax_rate',       v_tax_rate,
    'total_cents',    v_total,
    'coupon',         v_coupon,
    -- Null distingue "no pediste envío" de "ese método no aplica a tu dirección".
    'shipping_available',
      case when p_shipping_method_code is null then null
           else v_shipping_quote is not null end
  );
end;
$$;

comment on function private.compute_totals(jsonb, public.order_channel, uuid, text, text, integer, bigint) is
  'Desglose único de totales. Toda venta, de mostrador o web, pasa por aquí.';

revoke execute on function private.quote_shipping_cents(text, bigint, integer) from public, anon, authenticated;
revoke execute on function private.evaluate_coupon(text, public.order_channel, uuid, jsonb) from public, anon, authenticated;
revoke execute on function private.compute_totals(jsonb, public.order_channel, uuid, text, text, integer, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- API pública: validar un cupón sin consumirlo.
-- La clienta escribe el código y ve el descuento; nunca puede enumerar cupones
-- porque la tabla `coupons` no es legible y esta función solo responde por el
-- código exacto que ya conoce.
-- ---------------------------------------------------------------------------
create or replace function public.validate_coupon(
  p_code    text,
  p_lines   jsonb,
  p_channel public.order_channel default 'online'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
begin
  v_customer_id := private.current_customer_id();
  return private.evaluate_coupon(p_code, p_channel, v_customer_id, p_lines);
end;
$$;

grant execute on function public.validate_coupon(text, jsonb, public.order_channel) to anon, authenticated;
