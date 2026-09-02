-- ============================================================================
-- Lumane · 0017 · Venta y devolución en el POS
-- ============================================================================
-- pos_create_sale es UNA transacción: o se registra la venta completa (pedido,
-- líneas, pagos, salida de inventario, cupón consumido, turno de caja) o no
-- pasa nada. No existe el estado intermedio de "se cobró pero no se descontó".
--
-- IDEMPOTENCIA: la tablet genera `client_uuid` ANTES de cobrar. Si pierde la
-- red y reintenta, el índice único sobre orders.client_uuid hace que la
-- segunda llamada devuelva la venta original en vez de duplicarla. Sin esto,
-- una boutique con wifi intermitente cobraría dos veces.
--
-- El POS descuenta on_hand de inmediato (sin reservas): la prenda ya salió
-- físicamente de la tienda. La asimetría con la web es deliberada.
-- ============================================================================

create or replace function public.pos_create_sale(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_client_uuid uuid := (p_payload ->> 'client_uuid')::uuid;
  v_location    uuid;
  v_session     public.register_sessions%rowtype;
  v_customer_id uuid := (p_payload ->> 'customer_id')::uuid;
  v_coupon_code text := p_payload ->> 'coupon_code';
  v_manual_discount bigint := coalesce((p_payload ->> 'manual_discount_cents')::bigint, 0);
  v_lines       jsonb := '[]'::jsonb;
  v_totals      jsonb;
  v_coupon      jsonb;
  v_order       public.orders%rowtype;
  v_paid        bigint;
  v_position    integer := 0;
  raw           jsonb;
  v_variant     record;
  v_line_total  bigint;
  v_line_discount bigint;
  pay           jsonb;
begin
  if not private.has_permission('sales.create') then
    raise exception 'No tienes permiso para registrar ventas' using errcode = 'insufficient_privilege';
  end if;

  if v_client_uuid is null then
    raise exception 'Falta client_uuid: es lo que impide cobrar dos veces'
      using errcode = 'invalid_parameter_value';
  end if;

  -- ---- Idempotencia -------------------------------------------------------
  select * into v_order from public.orders where client_uuid = v_client_uuid;
  if found then
    return public.get_pos_sale(v_order.id) || jsonb_build_object('already_processed', true);
  end if;

  v_location := coalesce((p_payload ->> 'location_id')::uuid, private.current_location_id());

  -- ---- Turno de caja ------------------------------------------------------
  -- Sin caja abierta el corte del día no cuadraría. La app debe ofrecer
  -- abrirla al recibir este error, no ocultarlo.
  select * into v_session from public.register_sessions
  where location_id = v_location and status = 'open';
  if not found then
    raise exception 'No hay caja abierta en esta sucursal'
      using errcode = 'no_data_found', hint = 'register_closed';
  end if;

  -- ---- Líneas: precios y costos LEÍDOS DE LA BASE -------------------------
  for raw in select * from jsonb_array_elements(p_payload -> 'lines')
  loop
    select v.id, v.sku, v.title, v.price_cents, v.cost_cents, p.id as product_id, p.name as product_name
      into v_variant
    from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = (raw ->> 'variant_id')::uuid and v.is_active;

    if not found then
      raise exception 'Producto no disponible: %', raw ->> 'variant_id'
        using errcode = 'no_data_found';
    end if;

    v_line_discount := coalesce((raw ->> 'discount_cents')::bigint, 0);
    v_line_total := v_variant.price_cents * (raw ->> 'quantity')::integer - v_line_discount;
    if v_line_total < 0 then
      raise exception 'El descuento de una línea no puede superar su importe'
        using errcode = 'check_violation';
    end if;

    v_lines := v_lines || jsonb_build_object(
      'variant_id',       v_variant.id,
      'product_id',       v_variant.product_id,
      'product_name',     v_variant.product_name,
      'variant_title',    v_variant.title,
      'sku',              v_variant.sku,
      'unit_price_cents', v_variant.price_cents,
      'cost_cents',       v_variant.cost_cents,
      'quantity',         (raw ->> 'quantity')::integer,
      'discount_cents',   v_line_discount,
      'line_total_cents', v_line_total
    );
  end loop;

  if jsonb_array_length(v_lines) = 0 then
    raise exception 'La venta no tiene productos' using errcode = 'check_violation';
  end if;

  if v_manual_discount > 0 and not private.has_permission('sales.discount') then
    raise exception 'No tienes permiso para aplicar descuentos' using errcode = 'insufficient_privilege';
  end if;

  -- ---- Totales: el mismo motor que usa la tienda en línea -----------------
  v_totals := private.compute_totals(
    v_lines, 'pos', v_customer_id, v_coupon_code, null, null, v_manual_discount
  );
  v_coupon := v_totals -> 'coupon';

  -- ---- Pagos --------------------------------------------------------------
  select coalesce(sum((p ->> 'amount_cents')::bigint), 0) into v_paid
  from jsonb_array_elements(p_payload -> 'payments') p;

  if v_paid <> (v_totals ->> 'total_cents')::bigint then
    raise exception 'Los pagos suman % y el total es %',
      v_paid, (v_totals ->> 'total_cents')::bigint
      using errcode = 'check_violation';
  end if;

  -- ---- Pedido -------------------------------------------------------------
  insert into public.orders (
    channel, location_id, customer_id, register_session_id,
    status, payment_status,
    subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents,
    coupon_id, note, client_uuid, placed_at, created_by
  ) values (
    'pos', v_location, v_customer_id, v_session.id,
    'completed', 'paid',
    (v_totals ->> 'subtotal_cents')::bigint,
    (v_totals ->> 'discount_cents')::bigint,
    0,
    (v_totals ->> 'tax_cents')::bigint,
    (v_totals ->> 'total_cents')::bigint,
    case when (v_coupon ->> 'valid')::boolean then (v_coupon ->> 'coupon_id')::uuid end,
    p_payload ->> 'note',
    v_client_uuid,
    now(),
    (select auth.uid())
  ) returning * into v_order;

  for raw in select * from jsonb_array_elements(v_lines)
  loop
    v_position := v_position + 1;
    insert into public.order_lines (
      order_id, variant_id, product_id, sku, product_name, variant_title,
      unit_price_cents, cost_cents, tax_rate, quantity, discount_cents,
      total_cents, tax_cents, position
    ) values (
      v_order.id,
      (raw ->> 'variant_id')::uuid,
      (raw ->> 'product_id')::uuid,
      raw ->> 'sku',
      raw ->> 'product_name',
      coalesce(raw ->> 'variant_title', ''),
      (raw ->> 'unit_price_cents')::bigint,
      (raw ->> 'cost_cents')::bigint,
      (v_totals ->> 'tax_rate')::numeric,
      (raw ->> 'quantity')::integer,
      (raw ->> 'discount_cents')::bigint,
      (raw ->> 'line_total_cents')::bigint,
      private.extract_tax_cents((raw ->> 'line_total_cents')::bigint, (v_totals ->> 'tax_rate')::numeric),
      v_position
    );
  end loop;

  -- ---- Inventario ---------------------------------------------------------
  -- Orden fijo por variant_id: evita deadlocks si dos cajas venden a la vez.
  -- El CHECK de inventory_levels aborta toda la venta si falta stock.
  insert into public.inventory_movements
    (variant_id, location_id, type, quantity_delta, unit_cost_cents,
     reference_type, reference_id, created_by)
  select ol.variant_id, v_location, 'sale', -ol.quantity, ol.cost_cents,
         'order', v_order.id, (select auth.uid())
  from public.order_lines ol
  where ol.order_id = v_order.id and ol.variant_id is not null
  order by ol.variant_id;

  -- ---- Pagos (varias filas = pago mixto) ----------------------------------
  for pay in select * from jsonb_array_elements(p_payload -> 'payments')
  loop
    insert into public.payments (
      order_id, method, amount_cents, tendered_cents, change_cents,
      reference, created_by
    ) values (
      v_order.id,
      (pay ->> 'method')::public.payment_method,
      (pay ->> 'amount_cents')::bigint,
      (pay ->> 'tendered_cents')::bigint,
      case
        when (pay ->> 'tendered_cents') is not null
        then greatest((pay ->> 'tendered_cents')::bigint - (pay ->> 'amount_cents')::bigint, 0)
      end,
      pay ->> 'reference',
      (select auth.uid())
    );
  end loop;

  -- ---- Cupón --------------------------------------------------------------
  if (v_coupon ->> 'valid')::boolean then
    insert into public.coupon_redemptions (coupon_id, order_id, customer_id, amount_cents)
    values ((v_coupon ->> 'coupon_id')::uuid, v_order.id, v_customer_id,
            (v_totals ->> 'discount_cents')::bigint);
    update public.coupons set times_used = times_used + 1
    where id = (v_coupon ->> 'coupon_id')::uuid;
  end if;

  return public.get_pos_sale(v_order.id) || jsonb_build_object('already_processed', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Venta completa lista para imprimir el ticket o reimprimirlo.
-- ---------------------------------------------------------------------------
create or replace function public.get_pos_sale(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  -- SECURITY DEFINER saltaría RLS, así que el permiso se comprueba aquí: sin
  -- esta guarda una clienta con sesión podría leer cualquier venta por su id.
  if not private.has_permission('orders.read') then
    raise exception 'No tienes permiso para consultar ventas' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'order',    to_jsonb(o),
    'lines',    (select coalesce(jsonb_agg(to_jsonb(ol) order by ol.position), '[]'::jsonb)
                 from public.order_lines ol where ol.order_id = o.id),
    'payments', (select coalesce(jsonb_agg(to_jsonb(pay) order by pay.created_at), '[]'::jsonb)
                 from public.payments pay where pay.order_id = o.id),
    'customer', (select to_jsonb(cu) from public.customers cu where cu.id = o.customer_id),
    'location', (select to_jsonb(loc) from public.locations loc where loc.id = o.location_id),
    'change_cents', (select coalesce(sum(pay.change_cents), 0)
                     from public.payments pay where pay.order_id = o.id)
  ) into v_result
  from public.orders o
  where o.id = p_order_id;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Devolución. NO modifica la venta original: crea un documento propio con
-- pagos negativos y, si la prenda vuelve al inventario, su movimiento de
-- entrada. El histórico de la venta permanece intacto para siempre.
-- ---------------------------------------------------------------------------
create or replace function public.pos_create_return(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_client_uuid uuid := (p_payload ->> 'client_uuid')::uuid;
  v_order       public.orders%rowtype;
  v_return      public.returns%rowtype;
  v_restock     boolean := coalesce((p_payload ->> 'restock')::boolean, true);
  v_refund_method public.payment_method :=
    coalesce((p_payload ->> 'refund_method')::public.payment_method, 'cash');
  v_total       bigint := 0;
  raw           jsonb;
  v_line        public.order_lines%rowtype;
  v_already     integer;
  v_amount      bigint;
begin
  if not private.has_permission('sales.refund') then
    raise exception 'No tienes permiso para registrar devoluciones'
      using errcode = 'insufficient_privilege';
  end if;

  if v_client_uuid is not null then
    select * into v_return from public.returns where client_uuid = v_client_uuid;
    if found then
      return jsonb_build_object('return_id', v_return.id, 'reference', v_return.reference,
                                'already_processed', true);
    end if;
  end if;

  select * into v_order from public.orders where id = (p_payload ->> 'order_id')::uuid;
  if not found then
    raise exception 'Venta no encontrada' using errcode = 'no_data_found';
  end if;

  insert into public.returns (order_id, reason, restock, refund_method, client_uuid, created_by)
  values (v_order.id, p_payload ->> 'reason', v_restock, v_refund_method, v_client_uuid,
          (select auth.uid()))
  returning * into v_return;

  for raw in select * from jsonb_array_elements(p_payload -> 'lines')
  loop
    select * into v_line from public.order_lines
    where id = (raw ->> 'order_line_id')::uuid and order_id = v_order.id;
    if not found then
      raise exception 'La línea no pertenece a esta venta' using errcode = 'no_data_found';
    end if;

    -- No se puede devolver más de lo vendido, ni sumando devoluciones previas.
    select coalesce(sum(rl.quantity), 0) into v_already
    from public.return_lines rl where rl.order_line_id = v_line.id;

    if v_already + (raw ->> 'quantity')::integer > v_line.quantity then
      raise exception 'Ya se devolvieron % de % piezas de "%"',
        v_already, v_line.quantity, v_line.product_name
        using errcode = 'check_violation';
    end if;

    -- Se devuelve el precio REALMENTE pagado por pieza, con su descuento.
    v_amount := round(v_line.total_cents::numeric / v_line.quantity)::bigint
                * (raw ->> 'quantity')::integer;
    v_total := v_total + v_amount;

    insert into public.return_lines (return_id, order_line_id, quantity, amount_cents)
    values (v_return.id, v_line.id, (raw ->> 'quantity')::integer, v_amount);

    if v_restock and v_line.variant_id is not null then
      insert into public.inventory_movements
        (variant_id, location_id, type, quantity_delta, unit_cost_cents,
         reference_type, reference_id, note, created_by)
      values (v_line.variant_id, v_order.location_id, 'return',
              (raw ->> 'quantity')::integer, v_line.cost_cents,
              'return', v_return.id, p_payload ->> 'reason', (select auth.uid()));
    end if;
  end loop;

  update public.returns set refund_amount_cents = v_total where id = v_return.id;

  -- Pago NEGATIVO: el saldo del pedido y el efectivo esperado del turno se
  -- ajustan solos, sin lógica especial en el corte de caja.
  insert into public.payments (order_id, method, amount_cents, reference, created_by)
  values (v_order.id, v_refund_method, -v_total, v_return.reference, (select auth.uid()));

  update public.orders
  set payment_status = (case
        when v_total >= v_order.total_cents then 'refunded'
        else 'partially_refunded'
      end)::public.payment_status
  where id = v_order.id;

  return jsonb_build_object(
    'return_id', v_return.id,
    'reference', v_return.reference,
    'refund_amount_cents', v_total,
    'already_processed', false
  );
end;
$$;

grant execute on function public.pos_create_sale(jsonb) to authenticated;
grant execute on function public.get_pos_sale(uuid) to authenticated;
grant execute on function public.pos_create_return(jsonb) to authenticated;
