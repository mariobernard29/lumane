-- ============================================================================
-- Lumane · 0010 · Auditoría, outbox de eventos y newsletter
-- ============================================================================
-- OUTBOX PATTERN: las notificaciones no se envían dentro de la transacción de
-- la venta. Se escribe un evento en la misma transacción y un worker (Edge
-- Function en pg_cron) lo consume después.
--
-- Por qué importa: si Resend está caído, una venta no puede fallar. Y si el
-- correo falla, debe poder reintentarse sin repetir la venta. Escribir el
-- evento y el pedido en la misma transacción garantiza que no exista un pedido
-- sin su correo pendiente, ni un correo de un pedido que nunca se guardó.
-- ============================================================================

create table public.audit_log (
  id          uuid primary key default private.uuid_generate_v7(),
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);
create index audit_log_actor_id_idx on public.audit_log (actor_id);

create type public.outbox_status as enum ('pending', 'processing', 'sent', 'failed');

create table public.outbox_events (
  id           uuid primary key default private.uuid_generate_v7(),
  -- 'order.placed', 'order.status_changed', 'customer.registered', 'coupon.issued'
  topic        text not null,
  payload      jsonb not null,
  status       public.outbox_status not null default 'pending',
  attempts     integer not null default 0 check (attempts >= 0),
  last_error   text,
  -- Backoff exponencial: el worker solo toma eventos cuya hora ya llegó.
  next_attempt_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at   timestamptz not null default now()
);
-- El worker hace: ... where status='pending' and next_attempt_at <= now()
--                 order by next_attempt_at for update skip locked
create index outbox_events_ready_idx on public.outbox_events (next_attempt_at)
  where status = 'pending';
create index outbox_events_topic_idx on public.outbox_events (topic, created_at desc);

create table public.newsletter_subscribers (
  id            uuid primary key default private.uuid_generate_v7(),
  email         extensions.citext not null unique,
  customer_id   uuid references public.customers (id) on delete set null,
  source        text,
  is_active     boolean not null default true,
  confirmed_at  timestamptz,
  unsubscribed_at timestamptz,
  created_at    timestamptz not null default now()
);
create index newsletter_subscribers_customer_id_idx on public.newsletter_subscribers (customer_id);

-- ---------------------------------------------------------------------------
-- Emisor de eventos. Se llama desde los RPC de negocio, siempre dentro de la
-- misma transacción que el cambio que lo origina.
-- ---------------------------------------------------------------------------
create or replace function private.emit_event(p_topic text, p_payload jsonb)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.outbox_events (topic, payload)
  values (p_topic, p_payload)
  returning id;
$$;

revoke execute on function private.emit_event(text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Un pedido nuevo o un cambio de estado siempre generan su evento. Vive en un
-- trigger, no en la aplicación, para que ninguna ruta de código pueda olvidarlo.
-- ---------------------------------------------------------------------------
create or replace function private.emit_order_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Los borradores (carrito del POS en curso) no notifican a nadie.
  if new.to_status = 'draft' then
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
  return new;
end;
$$;

create trigger order_status_events_emit
  after insert on public.order_status_events
  for each row execute function private.emit_order_event();
