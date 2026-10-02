-- ============================================================================
-- Lumane · 0071 · El ticket impreso
-- ============================================================================
-- Llega la impresora térmica de caja (Moon58W, 58 mm, Bluetooth). Las
-- plantillas viven en `@lumane/core`; aquí solo lo que les faltaba para
-- llenarse con datos de verdad:
--
--   1. `store_settings.ticket_thanks`: el mensaje del pie del ticket, editable
--      en Admin › Ajustes. No va en el código: cambia con las temporadas.
--   2. `get_ticket_header()`: los datos del negocio para la cabecera (nombre,
--      contacto, redes, agradecimiento) más la sucursal de quien imprime. La
--      tablet lo pide una vez por sesión.
--   3. `get_pos_sale` + `cashier_name`: el ticket dice quién atendió, y hasta
--      ahora la venta solo traía el id.
--   4. `get_corte(session_id)`: el resumen de `get_register_summary` con los
--      nombres de quién abrió y quién cerró, que el papel del corte necesita.
--   5. `list_register_sessions(limit)`: los cortes anteriores de la sucursal,
--      para reimprimirlos.
-- ============================================================================

alter table public.store_settings
  add column ticket_thanks text default '¡Gracias por tu compra!';

comment on column public.store_settings.ticket_thanks is
  'Pie del ticket impreso en caja. Una o dos frases; vacío = sin pie.';

update public.store_settings set ticket_thanks = '¡Gracias por tu compra!' where ticket_thanks is null;

-- ---------------------------------------------------------------------------
-- 1. Cabecera del ticket
-- ---------------------------------------------------------------------------
create or replace function public.get_ticket_header()
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
    raise exception 'No tienes permiso para imprimir tickets' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'store_name',      s.store_name,
    'contact_phone',   s.contact_phone,
    'whatsapp_number', s.whatsapp_number,
    'social_links',    s.social_links,
    'ticket_thanks',   s.ticket_thanks,
    'tax_rate',        s.tax_rate,
    -- El mismo dominio que firman los correos (0059).
    'website',         'lumane.mx',
    'location', (select jsonb_build_object('id', l.id, 'name', l.name, 'phone', l.phone, 'address', l.address)
                 from public.locations l where l.id = private.current_location_id())
  ) into v_result
  from public.store_settings s
  where s.id;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. get_pos_sale: igual que en la 0017 + `cashier_name`.
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
                     from public.payments pay where pay.order_id = o.id),
    'cashier_name', (select p.full_name from public.profiles p where p.id = o.created_by)
  ) into v_result
  from public.orders o
  where o.id = p_order_id;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. El corte con nombres
-- ---------------------------------------------------------------------------
-- No reescribe `get_register_summary`: la envuelve. La comprobación de
-- permiso y el cálculo siguen en un solo sitio.
create or replace function public.get_corte(p_session_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_summary jsonb := public.get_register_summary(p_session_id);
begin
  return v_summary || jsonb_build_object(
    'opened_by_name', (select p.full_name from public.profiles p
                       where p.id = (v_summary -> 'session' ->> 'opened_by')::uuid),
    'closed_by_name', (select p.full_name from public.profiles p
                       where p.id = (v_summary -> 'session' ->> 'closed_by')::uuid)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Cortes anteriores de la sucursal
-- ---------------------------------------------------------------------------
create or replace function public.list_register_sessions(p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('register.open') then
    raise exception 'No tienes permiso para consultar la caja' using errcode = 'insufficient_privilege';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id',                  rs.id,
             'opened_at',           rs.opened_at,
             'closed_at',           rs.closed_at,
             'closed_by_name',      p.full_name,
             'expected_cash_cents', rs.expected_cash_cents,
             'counted_cash_cents',  rs.counted_cash_cents,
             'difference_cents',    rs.difference_cents
           ) order by rs.closed_at desc)
    from (
      select * from public.register_sessions
      where location_id = private.current_location_id() and status = 'closed'
      order by closed_at desc
      limit least(greatest(p_limit, 1), 100)
    ) rs
    left join public.profiles p on p.id = rs.closed_by
  ), '[]'::jsonb);
end;
$$;

-- Solo personal; ver 0019.
do $$
declare sig text;
begin
  foreach sig in array array[
    'public.get_ticket_header()',
    'public.get_pos_sale(uuid)',
    'public.get_corte(uuid)',
    'public.list_register_sessions(integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon', sig);
    execute format('grant execute on function %s to authenticated', sig);
  end loop;
end $$;
