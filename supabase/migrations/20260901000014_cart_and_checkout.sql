-- ============================================================================
-- Lumane · 0014 · Carrito y checkout de la tienda en línea
-- ============================================================================
-- El carrito de invitada no tiene sesión: se identifica con un `token` secreto
-- de 24 bytes que viaja en una cookie httpOnly. Por eso todas estas funciones
-- son SECURITY DEFINER y reciben el token: quien lo tiene, es dueño del
-- carrito. La tabla `carts` no es accesible directamente desde el navegador.
--
-- SECUENCIA DEL STOCK (la decisión de diseño más importante del checkout):
--
--   añadir a la bolsa  → NO reserva nada
--   iniciar el pago    → reserve_cart_stock() sube `reserved` con caducidad
--   pago confirmado    → confirm_online_order() convierte reserva en salida
--   pago abandonado    → release_expired_reservations() (pg_cron) lo devuelve
--
-- Reservar al añadir al carrito congelaría el inventario de la boutique cada
-- vez que alguien mira sin comprar. Reservar al confirmar el pago llegaría
-- tarde. La ventana correcta es entre ambos.
-- ============================================================================

create or replace function private.default_location_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select id from public.locations where is_default limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Líneas del carrito con PRECIOS LEÍDOS DE LA BASE, nunca del cliente.
-- ---------------------------------------------------------------------------
create or replace function private.cart_lines_json(p_cart_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x ->> 'product_name'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'variant_id',       v.id,
      'product_id',       p.id,
      'product_slug',     p.slug,
      'product_name',     p.name,
      'variant_title',    v.title,
      'sku',              v.sku,
      'unit_price_cents', v.price_cents,
      'compare_at_price_cents', v.compare_at_price_cents,
      'cost_cents',       v.cost_cents,
      'tax_rate',         (select s.tax_rate from public.store_settings s where s.id),
      'quantity',         cl.quantity,
      'line_total_cents', v.price_cents * cl.quantity,
      'available',        coalesce(il.available, 0),
      'image_path',       (
        select pi.storage_path from public.product_images pi
        where pi.product_id = p.id
        order by (pi.variant_id is distinct from v.id), pi.position
        limit 1
      )
    ) as x
    from public.cart_lines cl
    join public.product_variants v on v.id = cl.variant_id
    join public.products p on p.id = v.product_id
    left join public.inventory_levels il
      on il.variant_id = v.id and il.location_id = private.default_location_id()
    where cl.cart_id = p_cart_id
  ) s;
$$;

-- ---------------------------------------------------------------------------
-- Resolución del carrito a partir del token. Crea uno si hace falta.
-- ---------------------------------------------------------------------------
create or replace function private.resolve_cart(p_token text, p_create boolean default true)
returns public.carts
language plpgsql
volatile
set search_path = ''
as $$
declare
  c public.carts%rowtype;
begin
  if p_token is not null then
    select * into c from public.carts
    where token = p_token and status = 'active' and expires_at > now();
    if found then
      return c;
    end if;
  end if;

  if not p_create then
    raise exception 'Carrito no encontrado' using errcode = 'no_data_found';
  end if;

  insert into public.carts (customer_id) values (private.current_customer_id())
  returning * into c;
  return c;
end;
$$;

-- ---------------------------------------------------------------------------
-- API pública del carrito
-- ---------------------------------------------------------------------------

create or replace function public.get_cart(p_token text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.carts%rowtype;
  v_lines jsonb;
begin
  c := private.resolve_cart(p_token, true);
  v_lines := private.cart_lines_json(c.id);

  return jsonb_build_object(
    'cart_id',  c.id,
    'token',    c.token,
    'lines',    v_lines,
    'item_count', (
      select coalesce(sum((l ->> 'quantity')::integer), 0)
      from jsonb_array_elements(v_lines) l
    ),
    'totals',   private.compute_totals(v_lines, 'online', c.customer_id, null, null, null, 0)
  );
end;
$$;

comment on function public.get_cart(text) is
  'Carrito completo con precios y disponibilidad frescos. Crea uno si el token no existe.';

create or replace function public.add_cart_line(
  p_token      text,
  p_variant_id uuid,
  p_quantity   integer default 1
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.carts%rowtype;
  v_available integer;
  v_new_qty integer;
begin
  if p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor que cero' using errcode = 'check_violation';
  end if;

  c := private.resolve_cart(p_token, true);

  -- El producto debe existir, estar activo y publicado en línea.
  if not exists (
    select 1 from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = p_variant_id and v.is_active
      and p.status = 'active' and p.is_online
  ) then
    raise exception 'Esta pieza ya no está disponible' using errcode = 'no_data_found';
  end if;

  select coalesce(il.available, 0) into v_available
  from public.inventory_levels il
  where il.variant_id = p_variant_id and il.location_id = private.default_location_id();

  select coalesce(cl.quantity, 0) + p_quantity into v_new_qty
  from (select 1) dummy
  left join public.cart_lines cl on cl.cart_id = c.id and cl.variant_id = p_variant_id;

  -- Aviso temprano: la reserva real ocurre al pagar, pero no tiene sentido
  -- dejar meter a la bolsa más piezas de las que existen.
  if v_new_qty > coalesce(v_available, 0) then
    raise exception 'Solo quedan % piezas de esta talla', coalesce(v_available, 0)
      using errcode = 'check_violation';
  end if;

  insert into public.cart_lines (cart_id, variant_id, quantity)
  values (c.id, p_variant_id, p_quantity)
  on conflict (cart_id, variant_id) do update
    set quantity = public.cart_lines.quantity + excluded.quantity,
        updated_at = now();

  return public.get_cart(c.token);
end;
$$;

create or replace function public.set_cart_line_quantity(
  p_token      text,
  p_variant_id uuid,
  p_quantity   integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.carts%rowtype;
  v_available integer;
begin
  c := private.resolve_cart(p_token, false);

  if p_quantity <= 0 then
    delete from public.cart_lines where cart_id = c.id and variant_id = p_variant_id;
    return public.get_cart(c.token);
  end if;

  select coalesce(il.available, 0) into v_available
  from public.inventory_levels il
  where il.variant_id = p_variant_id and il.location_id = private.default_location_id();

  if p_quantity > coalesce(v_available, 0) then
    raise exception 'Solo quedan % piezas de esta talla', coalesce(v_available, 0)
      using errcode = 'check_violation';
  end if;

  update public.cart_lines
  set quantity = p_quantity, updated_at = now()
  where cart_id = c.id and variant_id = p_variant_id;

  return public.get_cart(c.token);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fusión al iniciar sesión: lo que la invitada ya tenía en la bolsa se suma al
-- carrito de su cuenta. Perder el carrito al hacer login pierde la venta.
-- ---------------------------------------------------------------------------
create or replace function public.merge_cart(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_guest public.carts%rowtype;
  v_owned public.carts%rowtype;
begin
  v_customer_id := private.current_customer_id();
  if v_customer_id is null then
    raise exception 'Necesitas iniciar sesión' using errcode = 'insufficient_privilege';
  end if;

  select * into v_guest from public.carts
  where token = p_token and status = 'active' and expires_at > now();
  if not found then
    return public.get_cart(null);
  end if;

  select * into v_owned from public.carts
  where customer_id = v_customer_id and status = 'active' and id <> v_guest.id
  order by updated_at desc limit 1;

  if not found then
    update public.carts set customer_id = v_customer_id, updated_at = now()
    where id = v_guest.id;
    return public.get_cart(v_guest.token);
  end if;

  insert into public.cart_lines (cart_id, variant_id, quantity)
  select v_owned.id, gl.variant_id, gl.quantity
  from public.cart_lines gl
  where gl.cart_id = v_guest.id
  on conflict (cart_id, variant_id) do update
    set quantity = public.cart_lines.quantity + excluded.quantity,
        updated_at = now();

  update public.carts set status = 'abandoned' where id = v_guest.id;
  return public.get_cart(v_owned.token);
end;
$$;

-- ---------------------------------------------------------------------------
-- Preview del checkout: recalcula SIEMPRE contra la base antes de cobrar.
-- ---------------------------------------------------------------------------
create or replace function public.preview_checkout(
  p_token                text,
  p_coupon_code          text default null,
  p_shipping_method_code text default null,
  p_distance_meters      integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.carts%rowtype;
  v_lines jsonb;
begin
  select * into c from public.carts
  where token = p_token and status = 'active' and expires_at > now();
  if not found then
    raise exception 'Carrito no encontrado' using errcode = 'no_data_found';
  end if;

  v_lines := private.cart_lines_json(c.id);

  return jsonb_build_object(
    'cart_id', c.id,
    'lines',   v_lines,
    'totals',  private.compute_totals(
                 v_lines, 'online', c.customer_id,
                 p_coupon_code, p_shipping_method_code, p_distance_meters, 0
               ),
    -- Si algo se agotó mientras compraba, el checkout debe decirlo ANTES de
    -- mandar a la clienta a la pasarela de pago.
    'unavailable', (
      select coalesce(jsonb_agg(l), '[]'::jsonb)
      from jsonb_array_elements(v_lines) l
      where (l ->> 'quantity')::integer > (l ->> 'available')::integer
    )
  );
end;
$$;

grant execute on function public.get_cart(text) to anon, authenticated;
grant execute on function public.add_cart_line(text, uuid, integer) to anon, authenticated;
grant execute on function public.set_cart_line_quantity(text, uuid, integer) to anon, authenticated;
grant execute on function public.merge_cart(text) to authenticated;
grant execute on function public.preview_checkout(text, text, text, integer) to anon, authenticated;
