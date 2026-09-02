-- ============================================================================
-- Lumane · 0008 · Caja (turnos, movimientos de efectivo y cortes)
-- ============================================================================
-- Un turno de caja es el contenedor de todo lo que pasa entre la apertura y el
-- cierre del día. Al cerrar se congelan el dinero esperado y el contado: el
-- corte es un documento histórico, no un cálculo que se rehace cada vez que se
-- consulta (si mañana se corrige una venta antigua, el corte de ayer no cambia).
--
--   esperado = fondo inicial
--            + ventas cobradas en efectivo del turno
--            + entradas de efectivo
--            - salidas de efectivo
--            - devoluciones pagadas en efectivo
-- ============================================================================

create type public.register_session_status as enum ('open', 'closed');

create table public.register_sessions (
  id                  uuid primary key default private.uuid_generate_v7(),
  location_id         uuid not null references public.locations (id) on delete restrict,
  status              public.register_session_status not null default 'open',
  opened_by           uuid references public.profiles (id) on delete set null,
  opened_at           timestamptz not null default now(),
  opening_float_cents bigint not null default 0 check (opening_float_cents >= 0),
  closed_by           uuid references public.profiles (id) on delete set null,
  closed_at           timestamptz,
  -- Congelados al cerrar. Null mientras el turno sigue abierto.
  expected_cash_cents bigint,
  counted_cash_cents  bigint,
  -- contado - esperado. Negativo = faltante.
  difference_cents    bigint,
  -- Desglose del corte por método de pago, congelado al cerrar.
  totals_snapshot     jsonb,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint register_close_is_complete check (
    (status = 'open'   and closed_at is null and counted_cash_cents is null) or
    (status = 'closed' and closed_at is not null and counted_cash_cents is not null)
  )
);

create index register_sessions_location_idx on public.register_sessions (location_id, opened_at desc);
create index register_sessions_opened_by_idx on public.register_sessions (opened_by);
create index register_sessions_closed_by_idx on public.register_sessions (closed_by);

-- Una sola caja abierta por sucursal: abrir dos turnos a la vez haría
-- imposible cuadrar el efectivo.
create unique index register_sessions_one_open_per_location_idx
  on public.register_sessions (location_id) where status = 'open';

create type public.cash_direction as enum ('in', 'out');

create table public.cash_movements (
  id           uuid primary key default private.uuid_generate_v7(),
  session_id   uuid not null references public.register_sessions (id) on delete cascade,
  direction    public.cash_direction not null,
  amount_cents bigint not null check (amount_cents > 0),
  reason       text not null,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index cash_movements_session_id_idx on public.cash_movements (session_id);
create index cash_movements_created_by_idx on public.cash_movements (created_by);

create trigger register_sessions_set_updated_at before update on public.register_sessions
  for each row execute function private.set_updated_at();

alter table public.orders
  add constraint orders_register_session_id_fkey
  foreign key (register_session_id) references public.register_sessions (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Efectivo esperado en el turno. Se usa al cerrar (para congelarlo) y durante
-- el turno (para mostrar el acumulado en vivo en el POS).
-- ---------------------------------------------------------------------------
create or replace function private.expected_cash_cents(p_session_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select rs.opening_float_cents from public.register_sessions rs
              where rs.id = p_session_id), 0)
  + coalesce((select sum(pay.amount_cents)
              from public.payments pay
              join public.orders o on o.id = pay.order_id
              where o.register_session_id = p_session_id
                and pay.method = 'cash'), 0)
  + coalesce((select sum(case when cm.direction = 'in' then cm.amount_cents
                             else -cm.amount_cents end)
              from public.cash_movements cm
              where cm.session_id = p_session_id), 0);
$$;

comment on function private.expected_cash_cents(uuid) is
  'Efectivo que debería haber en el cajón. Los pagos de devolución ya son negativos.';

revoke execute on function private.expected_cash_cents(uuid) from public, anon, authenticated;
