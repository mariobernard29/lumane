-- ============================================================================
-- Lumane · 0059 · Avisos al correo de administración
-- ============================================================================
-- Tres correos que la boutique quiere recibir sin tener que abrir nada:
--
--   1. `admin.online_sale`    · cada venta de la tienda en línea
--   2. `admin.register_close` · el corte del día, al cerrar la caja
--   3. `admin.stock_alert`    · cuando una prenda se agota o baja del mínimo
--
-- Los tres viajan por el outbox que ya existe (0041-0044): se insertan en
-- `outbox_events`, el cron los recoge cada minuto y la Edge Function los manda
-- por Resend. No hay tubería nueva — solo temas nuevos y una bifurcación en el
-- worker, porque estos correos NO son de un pedido y no le escriben a una
-- clienta sino a la casa.
--
-- ---------------------------------------------------------------------------
-- El correo todavía no existe, y eso decide el diseño
-- ---------------------------------------------------------------------------
-- `admin_email` nace vacío: la propietaria lo pondrá después desde Ajustes.
-- Mientras esté vacío **no se emite ningún evento**, en vez de emitirlos y
-- dejar que el worker los descarte.
--
-- La diferencia importa. Un cron horario emitiendo eventos que nadie puede
-- recibir llenaría `outbox_events` de miles de filas «omitidas» antes de que
-- alguien escriba una dirección, y esa tabla es donde se diagnostica por qué
-- un correo de verdad no llegó. Se prefiere no tener rastro a tener ruido.
--
-- El precio: los avisos empiezan el día que se ponga el correo, sin efecto
-- retroactivo. Que es justo lo que se espera de una alerta.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · Dónde vive la dirección
-- ---------------------------------------------------------------------------

alter table public.store_settings
  add column if not exists admin_email text;

comment on column public.store_settings.admin_email is
  'Destino de los avisos internos (ventas en línea, corte del día, agotados). Vacío = sin avisos.';

-- ---------------------------------------------------------------------------
-- 2 · El emisor común
-- ---------------------------------------------------------------------------

create or replace function private.emit_admin_event(p_topic text, p_payload jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_correo text;
  v_id     uuid;
begin
  select nullif(btrim(coalesce(s.admin_email, '')), '')
  into v_correo
  from public.store_settings s
  where s.id;

  -- Sin dirección no se emite. Ver el encabezado: es deliberado.
  if v_correo is null then
    return null;
  end if;

  insert into public.outbox_events (topic, payload)
  values (p_topic, p_payload)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function private.emit_admin_event(text, jsonb) is
  'Encola un aviso interno. No hace nada si no hay admin_email configurado.';

-- ---------------------------------------------------------------------------
-- 3 · Venta en línea
-- ---------------------------------------------------------------------------
-- Se cuelga del mismo disparador que ya decide los correos de pedido, en vez
-- de crear uno nuevo sobre `orders`: así el aviso interno y el correo a la
-- clienta nacen del MISMO hecho —la fila de bitácora— y no pueden divergir.
-- Dos disparadores distintos sobre dos tablas distintas es cómo se acaba
-- avisando a la casa de una venta que la clienta nunca recibió.

create or replace function private.emit_order_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_channel public.order_channel;
begin
  -- Los borradores (carrito del POS en curso) no notifican a nadie.
  if new.to_status = 'draft' then
    return new;
  end if;

  select o.channel into v_channel from public.orders o where o.id = new.order_id;

  -- El nacimiento de una venta de mostrador no avisa: quien compró ya se fue
  -- con su prenda. Su ticket se manda a petición, con `pos_send_receipt`.
  if v_channel = 'pos' and new.from_status is null then
    return new;
  end if;

  perform private.emit_event(
    case when new.from_status is null then 'order.placed' else 'order.status_changed' end,
    jsonb_build_object(
      'order_id',    new.order_id,
      'from_status', new.from_status,
      'to_status',   new.to_status,
      'occurred_at', new.created_at
    )
  );

  -- El aviso a la casa, solo al nacer una venta en línea. Los cambios de
  -- estado posteriores los provoca la propia boutique desde la tablet: no
  -- tiene sentido avisarle de lo que acaba de hacer.
  if v_channel = 'online' and new.from_status is null then
    perform private.emit_admin_event(
      'admin.online_sale',
      jsonb_build_object('order_id', new.order_id, 'occurred_at', new.created_at)
    );
  end if;

  return new;
end;
$$;

comment on function private.emit_order_event() is
  'Emite el correo de un cambio de estado y, si la venta es en línea y nueva, el aviso a administración.';

-- ---------------------------------------------------------------------------
-- 4 · Corte del día
-- ---------------------------------------------------------------------------
-- Disparador y no un añadido dentro de `close_register`, por la misma razón
-- que la máquina de estados de pedidos: un disparador cubre a TODO el que
-- cierre una caja —la tablet, el panel, un `psql` de madrugada—, mientras que
-- meterlo en el RPC solo cubre a quien pase por el RPC.

create or replace function private.emit_register_close_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.emit_admin_event(
    'admin.register_close',
    jsonb_build_object('session_id', new.id, 'closed_at', new.closed_at)
  );
  return new;
end;
$$;

drop trigger if exists register_sessions_notify_close on public.register_sessions;

create trigger register_sessions_notify_close
  after update of status on public.register_sessions
  for each row
  when (old.status is distinct from new.status and new.status = 'closed')
  execute function private.emit_register_close_event();

comment on function private.emit_register_close_event() is
  'Encola el correo del corte del día cuando una caja pasa a cerrada.';

-- ---------------------------------------------------------------------------
-- 5 · Agotados
-- ---------------------------------------------------------------------------
-- `v_stock_alerts` ya dice qué está agotado o por agotarse. Lo que faltaba era
-- decidir CUÁNDO avisar, y ahí están las dos malas opciones evidentes:
--
--   · Un correo por cada variante que cruza el mínimo → una venta de cinco
--     piezas distintas manda cinco correos seguidos.
--   · Un resumen diario a hora fija → repite cada día lo mismo hasta que
--     alguien reponga, y se aprende a ignorarlo.
--
-- Se hace una tercera: se revisa cada hora y **solo se manda si la lista
-- cambió** desde el último aviso. Se guarda una huella de la lista y se
-- compara. Así una prenda que se agota a las 11:00 se avisa a las 11:00, y no
-- se vuelve a mencionar hasta que entre o salga otra del listado.

create table if not exists private.stock_alert_state (
  location_id uuid primary key references public.locations(id) on delete cascade,
  fingerprint text not null,
  sent_at     timestamptz not null default now()
);

comment on table private.stock_alert_state is
  'Huella del último aviso de agotados por sucursal. Evita repetir el mismo correo cada hora.';

create or replace function private.revisar_agotados()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_enviados integer := 0;
  v_loc      record;
  v_huella   text;
  v_previa   text;
  v_total    integer;
begin
  for v_loc in select l.id from public.locations l where l.is_active loop
    -- La huella incluye el NIVEL de alerta, no solo el identificador: que una
    -- prenda pase de «por agotarse» a «agotada» es una noticia distinta y debe
    -- volver a avisar.
    select md5(string_agg(a.variant_id::text || ':' || a.alert, ',' order by a.variant_id)),
           count(*)
    into v_huella, v_total
    from public.v_stock_alerts a
    where a.location_id = v_loc.id;

    if v_huella is null then
      -- Nada que reportar. Se limpia el estado para que, si mañana vuelve a
      -- agotarse lo mismo, se considere una lista nueva y se avise.
      delete from private.stock_alert_state where location_id = v_loc.id;
      continue;
    end if;

    select s.fingerprint into v_previa
    from private.stock_alert_state s
    where s.location_id = v_loc.id;

    if v_previa is not distinct from v_huella then
      continue;
    end if;

    if private.emit_admin_event(
         'admin.stock_alert',
         jsonb_build_object('location_id', v_loc.id, 'total', v_total)
       ) is not null then
      v_enviados := v_enviados + 1;

      -- El estado se guarda SOLO si el evento se encoló. Si no hay correo de
      -- administración configurado, la huella no se apunta y el aviso saldrá
      -- entero el día que se configure, en vez de perderse por haberlo dado
      -- por enviado.
      insert into private.stock_alert_state (location_id, fingerprint, sent_at)
      values (v_loc.id, v_huella, now())
      on conflict (location_id) do update
        set fingerprint = excluded.fingerprint, sent_at = excluded.sent_at;
    end if;
  end loop;

  return v_enviados;
end;
$$;

comment on function private.revisar_agotados() is
  'Encola el aviso de agotados si la lista cambió desde el último envío. La llama pg_cron cada hora.';

-- ---------------------------------------------------------------------------
-- 6 · Los datos que necesita el worker
-- ---------------------------------------------------------------------------
-- Un solo despachador en vez de tres funciones: la Edge Function no tiene que
-- saber qué datos lleva cada tema, solo pedirlos. Devuelve siempre
-- `admin_email` y `store`, y encima lo propio del aviso.

create or replace function public.admin_email_payload(p_topic text, p_payload jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_correo text;
  v_store  jsonb;
  v_datos  jsonb;
begin
  select nullif(btrim(coalesce(s.admin_email, '')), ''),
         jsonb_build_object(
           'name',    s.store_name,
           'email',   s.contact_email,
           'phone',   s.contact_phone,
           'website', 'https://lumane.mx'
         )
  into v_correo, v_store
  from public.store_settings s
  where s.id;

  if v_correo is null then
    return null;
  end if;

  if p_topic = 'admin.register_close' then
    select jsonb_build_object(
      'session', jsonb_build_object(
        'id',                   rs.id,
        'opened_at',            rs.opened_at,
        'closed_at',            rs.closed_at,
        'opening_float_cents',  rs.opening_float_cents,
        'expected_cash_cents',  rs.expected_cash_cents,
        'counted_cash_cents',   rs.counted_cash_cents,
        'difference_cents',     rs.difference_cents,
        'notes',                rs.notes,
        'location',             l.name,
        'timezone',             coalesce(l.timezone, 'UTC'),
        'opened_by',            (select p.full_name from public.profiles p where p.id = rs.opened_by),
        'closed_by',            (select p.full_name from public.profiles p where p.id = rs.closed_by)
      ),
      -- `totals_snapshot` lo congela `close_register` al cerrar. Se usa ese y
      -- no un recálculo: el correo debe decir lo que decía el corte que la
      -- cajera firmó, aunque después se registre una devolución.
      'by_method', coalesce(rs.totals_snapshot, '{}'::jsonb),
      'sales', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'number',      o.order_number,
                 'placed_at',   o.placed_at,
                 'total_cents', o.total_cents,
                 'customer',    (select c.first_name from public.customers c where c.id = o.customer_id)
               ) order by o.placed_at), '[]'::jsonb)
        from public.orders o
        where o.register_session_id = rs.id
          and o.status not in ('draft'::public.order_status, 'cancelled'::public.order_status)
      ),
      'cash_movements', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'direction',    m.direction,
                 'amount_cents', m.amount_cents,
                 'reason',       m.reason
               ) order by m.created_at), '[]'::jsonb)
        from public.cash_movements m
        where m.session_id = rs.id
      )
    )
    into v_datos
    from public.register_sessions rs
    join public.locations l on l.id = rs.location_id
    where rs.id = (p_payload ->> 'session_id')::uuid;

  elsif p_topic = 'admin.stock_alert' then
    select jsonb_build_object(
      'location', (select l.name from public.locations l
                   where l.id = (p_payload ->> 'location_id')::uuid),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'product_name',  a.product_name,
                 'variant_title', a.variant_title,
                 'sku',           a.sku,
                 'available',     a.available,
                 'threshold',     a.low_stock_threshold,
                 'alert',         a.alert
               ) order by (a.alert = 'out') desc, a.product_name, a.variant_title)
        from public.v_stock_alerts a
        where a.location_id = (p_payload ->> 'location_id')::uuid
      ), '[]'::jsonb)
    )
    into v_datos;

  elsif p_topic = 'admin.online_sale' then
    -- Se delega en `order_email_payload`, que ya arma pedido, líneas, pagos,
    -- clienta y envío. Un segundo armador del mismo pedido acabaría
    -- discrepando del primero, y entonces el aviso a la casa y el correo a la
    -- clienta dirían cosas distintas de la misma venta.
    v_datos := jsonb_build_object(
      'pedido', public.order_email_payload((p_payload ->> 'order_id')::uuid)
    );

    -- El pedido pudo borrarse entre la emisión y el envío.
    if v_datos -> 'pedido' is null or v_datos ->> 'pedido' = 'null' then
      return null;
    end if;

  else
    return null;
  end if;

  if v_datos is null then
    return null;
  end if;

  return jsonb_build_object('admin_email', v_correo, 'store', v_store) || v_datos;
end;
$$;

comment on function public.admin_email_payload(text, jsonb) is
  'Datos de un aviso interno para la Edge Function. Devuelve null si no hay admin_email o el registro ya no existe.';

-- Es infraestructura del worker, no una lectura de la tienda: nadie con sesión
-- de clienta ni de cajera tiene por qué poder pedir el corte de caja entero.
revoke execute on function public.admin_email_payload(text, jsonb) from public, anon, authenticated;
grant  execute on function public.admin_email_payload(text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 7 · El reloj
-- ---------------------------------------------------------------------------

select cron.unschedule('lumane-agotados')
where exists (select 1 from cron.job where jobname = 'lumane-agotados');

select cron.schedule(
  'lumane-agotados',
  -- Cada hora en punto. La huella de la sección 5 es lo que impide que esto
  -- se convierta en veinticuatro correos al día.
  '0 * * * *',
  $cron$ select private.revisar_agotados(); $cron$
);
