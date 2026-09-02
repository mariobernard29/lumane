-- ============================================================================
-- Lumane · 0018 · Operaciones de caja e inventario
-- ============================================================================
-- El corte de caja se CONGELA al cerrar (expected, counted, difference y el
-- desglose por método de pago). Si mañana se corrige una venta antigua, el
-- corte de ayer no cambia: un corte es un documento firmado, no una consulta.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Apertura de caja
-- ---------------------------------------------------------------------------
create or replace function public.open_register(
  p_opening_float_cents bigint default 0,
  p_location_id         uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_location uuid;
  v_session  public.register_sessions%rowtype;
begin
  if not private.has_permission('register.open') then
    raise exception 'No tienes permiso para abrir caja' using errcode = 'insufficient_privilege';
  end if;

  v_location := coalesce(p_location_id, private.current_location_id());

  -- El índice único parcial ya lo impide; este mensaje explica por qué.
  select * into v_session from public.register_sessions
  where location_id = v_location and status = 'open';
  if found then
    raise exception 'Ya hay una caja abierta desde %', v_session.opened_at
      using errcode = 'unique_violation', hint = 'register_already_open';
  end if;

  insert into public.register_sessions (location_id, opened_by, opening_float_cents)
  values (v_location, (select auth.uid()), p_opening_float_cents)
  returning * into v_session;

  return to_jsonb(v_session);
end;
$$;

-- ---------------------------------------------------------------------------
-- Entradas y salidas de efectivo (pago a proveedor, retiro, fondo extra...)
-- ---------------------------------------------------------------------------
create or replace function public.add_cash_movement(
  p_direction    public.cash_direction,
  p_amount_cents bigint,
  p_reason       text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.register_sessions%rowtype;
  v_movement public.cash_movements%rowtype;
begin
  if not private.has_permission('register.movement') then
    raise exception 'No tienes permiso para mover efectivo' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Todo movimiento de efectivo necesita un motivo'
      using errcode = 'invalid_parameter_value';
  end if;

  select * into v_session from public.register_sessions
  where location_id = private.current_location_id() and status = 'open';
  if not found then
    raise exception 'No hay caja abierta' using errcode = 'no_data_found', hint = 'register_closed';
  end if;

  insert into public.cash_movements (session_id, direction, amount_cents, reason, created_by)
  values (v_session.id, p_direction, p_amount_cents, btrim(p_reason), (select auth.uid()))
  returning * into v_movement;

  return to_jsonb(v_movement);
end;
$$;

-- ---------------------------------------------------------------------------
-- Resumen del turno: sirve en vivo durante el día y alimenta el corte.
-- ---------------------------------------------------------------------------
create or replace function public.get_register_summary(p_session_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session public.register_sessions%rowtype;
begin
  if not private.has_permission('register.open') then
    raise exception 'No tienes permiso para consultar la caja' using errcode = 'insufficient_privilege';
  end if;

  if p_session_id is null then
    select * into v_session from public.register_sessions
    where location_id = private.current_location_id() and status = 'open';
  else
    select * into v_session from public.register_sessions where id = p_session_id;
  end if;

  if not found then
    raise exception 'Turno de caja no encontrado' using errcode = 'no_data_found';
  end if;

  return jsonb_build_object(
    'session', to_jsonb(v_session),
    -- Un turno cerrado devuelve su foto congelada; uno abierto, el cálculo vivo.
    'expected_cash_cents', coalesce(
      v_session.expected_cash_cents,
      private.expected_cash_cents(v_session.id)
    ),
    'by_method', coalesce(v_session.totals_snapshot, (
      select jsonb_object_agg(t.method, jsonb_build_object(
               'amount_cents', t.amount_cents, 'count', t.n))
      from (
        select pay.method::text as method,
               sum(pay.amount_cents) as amount_cents,
               count(*) as n
        from public.payments pay
        join public.orders o on o.id = pay.order_id
        where o.register_session_id = v_session.id
        group by pay.method
      ) t
    ), '{}'::jsonb),
    'sales_count', (
      select count(*) from public.orders o
      where o.register_session_id = v_session.id and o.status <> 'cancelled'
    ),
    'sales_total_cents', coalesce((
      select sum(o.total_cents) from public.orders o
      where o.register_session_id = v_session.id and o.status <> 'cancelled'
    ), 0),
    'cash_in_cents', coalesce((
      select sum(cm.amount_cents) from public.cash_movements cm
      where cm.session_id = v_session.id and cm.direction = 'in'
    ), 0),
    'cash_out_cents', coalesce((
      select sum(cm.amount_cents) from public.cash_movements cm
      where cm.session_id = v_session.id and cm.direction = 'out'
    ), 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Cierre y corte
-- ---------------------------------------------------------------------------
create or replace function public.close_register(
  p_counted_cash_cents bigint,
  p_session_id         uuid default null,
  p_notes              text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session  public.register_sessions%rowtype;
  v_expected bigint;
  v_snapshot jsonb;
begin
  if not private.has_permission('register.close') then
    raise exception 'No tienes permiso para cerrar caja' using errcode = 'insufficient_privilege';
  end if;

  if p_session_id is null then
    select * into v_session from public.register_sessions
    where location_id = private.current_location_id() and status = 'open';
  else
    select * into v_session from public.register_sessions
    where id = p_session_id and status = 'open';
  end if;

  if not found then
    raise exception 'No hay caja abierta que cerrar' using errcode = 'no_data_found';
  end if;

  v_expected := private.expected_cash_cents(v_session.id);

  select coalesce(jsonb_object_agg(t.method, jsonb_build_object(
           'amount_cents', t.amount_cents, 'count', t.n)), '{}'::jsonb)
    into v_snapshot
  from (
    select pay.method::text as method, sum(pay.amount_cents) as amount_cents, count(*) as n
    from public.payments pay
    join public.orders o on o.id = pay.order_id
    where o.register_session_id = v_session.id
    group by pay.method
  ) t;

  update public.register_sessions
  set status = 'closed',
      closed_by = (select auth.uid()),
      closed_at = now(),
      expected_cash_cents = v_expected,
      counted_cash_cents  = p_counted_cash_cents,
      -- Negativo = faltante, positivo = sobrante.
      difference_cents    = p_counted_cash_cents - v_expected,
      totals_snapshot     = v_snapshot,
      notes               = p_notes
  where id = v_session.id
  returning * into v_session;

  return public.get_register_summary(v_session.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Ajustes de inventario
-- ---------------------------------------------------------------------------
-- Se ajusta escribiendo un MOVIMIENTO, nunca sobreescribiendo la cantidad: así
-- el ledger conserva quién ajustó, cuándo y por qué.
-- ---------------------------------------------------------------------------
create or replace function public.adjust_inventory(
  p_variant_id  uuid,
  p_new_quantity integer,
  p_reason      text,
  p_location_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_location uuid;
  v_current  integer;
  v_delta    integer;
begin
  if not private.has_permission('inventory.adjust') then
    raise exception 'No tienes permiso para ajustar inventario'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Todo ajuste necesita un motivo' using errcode = 'invalid_parameter_value';
  end if;

  v_location := coalesce(p_location_id, private.current_location_id());

  select on_hand into v_current from public.inventory_levels
  where variant_id = p_variant_id and location_id = v_location
  for update;

  v_delta := p_new_quantity - coalesce(v_current, 0);

  if v_delta = 0 then
    return jsonb_build_object('changed', false, 'on_hand', p_new_quantity);
  end if;

  insert into public.inventory_movements
    (variant_id, location_id, type, quantity_delta, reference_type, note, created_by)
  values (p_variant_id, v_location,
          case when coalesce(v_current, 0) = 0 and v_delta > 0 then 'initial' else 'adjustment' end,
          v_delta, 'adjustment', btrim(p_reason), (select auth.uid()));

  return jsonb_build_object(
    'changed', true,
    'delta', v_delta,
    'on_hand', (select on_hand from public.inventory_levels
                where variant_id = p_variant_id and location_id = v_location)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Conteo físico: [{ "variant_id": uuid, "counted": integer }, ...]
-- ---------------------------------------------------------------------------
create or replace function public.apply_stock_count(
  p_counts      jsonb,
  p_location_id uuid default null,
  p_note        text default 'Conteo físico'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_location uuid;
  v_adjusted integer := 0;
  raw jsonb;
  v_result jsonb;
begin
  if not private.has_permission('inventory.adjust') then
    raise exception 'No tienes permiso para ajustar inventario'
      using errcode = 'insufficient_privilege';
  end if;

  v_location := coalesce(p_location_id, private.current_location_id());

  -- Orden fijo por variant_id: mismo criterio anti-deadlock que en las ventas.
  for raw in
    select value from jsonb_array_elements(p_counts) value
    order by (value ->> 'variant_id')
  loop
    v_result := public.adjust_inventory(
      (raw ->> 'variant_id')::uuid, (raw ->> 'counted')::integer, p_note, v_location
    );
    if (v_result ->> 'changed')::boolean then
      v_adjusted := v_adjusted + 1;
    end if;
  end loop;

  return jsonb_build_object('adjusted', v_adjusted, 'counted', jsonb_array_length(p_counts));
end;
$$;

-- ---------------------------------------------------------------------------
-- Entrada de mercancía (compra a proveedor). Actualiza el costo de la variante
-- para que el margen de las ventas futuras sea el real.
-- ---------------------------------------------------------------------------
create or replace function public.receive_stock(
  p_variant_id      uuid,
  p_quantity        integer,
  p_unit_cost_cents bigint default null,
  p_note            text default null,
  p_location_id     uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_location uuid;
begin
  if not private.has_permission('inventory.write') then
    raise exception 'No tienes permiso para registrar entradas'
      using errcode = 'insufficient_privilege';
  end if;
  if p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor que cero' using errcode = 'check_violation';
  end if;

  v_location := coalesce(p_location_id, private.current_location_id());

  insert into public.inventory_movements
    (variant_id, location_id, type, quantity_delta, unit_cost_cents,
     reference_type, note, created_by)
  values (p_variant_id, v_location, 'purchase', p_quantity, p_unit_cost_cents,
          'purchase', p_note, (select auth.uid()));

  if p_unit_cost_cents is not null then
    update public.product_variants set cost_cents = p_unit_cost_cents
    where id = p_variant_id;
  end if;

  return jsonb_build_object(
    'on_hand', (select on_hand from public.inventory_levels
                where variant_id = p_variant_id and location_id = v_location)
  );
end;
$$;

grant execute on function public.open_register(bigint, uuid) to authenticated;
grant execute on function public.add_cash_movement(public.cash_direction, bigint, text) to authenticated;
grant execute on function public.get_register_summary(uuid) to authenticated;
grant execute on function public.close_register(bigint, uuid, text) to authenticated;
grant execute on function public.adjust_inventory(uuid, integer, text, uuid) to authenticated;
grant execute on function public.apply_stock_count(jsonb, uuid, text) to authenticated;
grant execute on function public.receive_stock(uuid, integer, bigint, text, uuid) to authenticated;
