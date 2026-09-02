-- ============================================================================
-- Lumane · 0004 · Inventario
-- ============================================================================
-- Arquitectura: LEDGER + NIVEL CACHEADO.
--
--   inventory_movements  → append-only. Es LA VERDAD. Nunca se edita ni borra.
--   inventory_levels     → caché derivada (on_hand, reserved). Reconstruible
--                          en cualquier momento sumando el ledger.
--
-- La garantía de "nunca vender sin stock" NO vive en la aplicación: vive en el
-- CHECK de inventory_levels. Aunque un bug, un script o una llamada directa a
-- la API intenten dejar el disponible en negativo, Postgres lo rechaza.
--
-- Reservas asimétricas y deliberadas:
--   * POS      → descuenta on_hand al instante (la prenda ya salió físicamente).
--   * Web      → solo RESERVA al iniciar el pago, con caducidad; descuenta al
--                confirmarse. Añadir al carrito NO reserva, para que un carrito
--                abandonado no congele el inventario de la boutique.
-- ============================================================================

create table public.inventory_levels (
  variant_id  uuid not null references public.product_variants (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  on_hand     integer not null default 0,
  reserved    integer not null default 0,
  -- Lo que realmente se puede vender ahora mismo.
  available   integer generated always as (on_hand - reserved) stored,
  updated_at  timestamptz not null default now(),
  primary key (variant_id, location_id),
  constraint inventory_never_negative
    check (on_hand >= 0 and reserved >= 0 and on_hand - reserved >= 0)
);

create index inventory_levels_location_id_idx on public.inventory_levels (location_id);
-- Sirve directo a las alertas de agotados y al filtro "solo disponible".
create index inventory_levels_available_idx on public.inventory_levels (location_id, available)
  where available <= 0;

create type public.inventory_movement_type as enum (
  'initial',       -- carga inicial de existencias
  'sale',          -- venta POS o pedido online confirmado
  'return',        -- devolución con reintegro
  'purchase',      -- entrada por compra a proveedor
  'adjustment',    -- ajuste manual o conteo físico
  'transfer_in',
  'transfer_out'
);

create table public.inventory_movements (
  id             uuid primary key default private.uuid_generate_v7(),
  variant_id     uuid not null references public.product_variants (id) on delete restrict,
  location_id    uuid not null references public.locations (id) on delete restrict,
  type           public.inventory_movement_type not null,
  -- Negativo = sale stock, positivo = entra stock. Nunca cero.
  quantity_delta integer not null check (quantity_delta <> 0),
  unit_cost_cents bigint check (unit_cost_cents >= 0),
  -- A qué documento responde el movimiento ('order', 'return', 'transfer'...).
  reference_type text,
  reference_id   uuid,
  note           text,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index inventory_movements_variant_created_idx
  on public.inventory_movements (variant_id, created_at desc);
create index inventory_movements_location_id_idx on public.inventory_movements (location_id);
create index inventory_movements_reference_idx
  on public.inventory_movements (reference_type, reference_id);
create index inventory_movements_created_by_idx on public.inventory_movements (created_by);

-- ---------------------------------------------------------------------------
-- El ledger es inmutable. Corregir un error es escribir un ajuste, no editar
-- el pasado: así la auditoría siempre cuadra.
-- ---------------------------------------------------------------------------
create or replace function private.reject_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'inventory_movements es append-only: registra un movimiento de ajuste en lugar de editar el historial'
    using errcode = 'restrict_violation';
end;
$$;

create trigger inventory_movements_immutable
  before update or delete on public.inventory_movements
  for each row execute function private.reject_ledger_mutation();

-- ---------------------------------------------------------------------------
-- Proyección del ledger sobre la caché de niveles. Corre en la MISMA
-- transacción que el movimiento, así que el CHECK de inventory_levels aborta
-- la venta completa si dejaría el stock en negativo.
-- ---------------------------------------------------------------------------
create or replace function private.apply_inventory_movement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.inventory_levels as il (variant_id, location_id, on_hand)
  values (new.variant_id, new.location_id, new.quantity_delta)
  on conflict (variant_id, location_id) do update
    set on_hand = il.on_hand + excluded.on_hand,
        updated_at = now();
  return new;
end;
$$;

create trigger inventory_movements_apply
  after insert on public.inventory_movements
  for each row execute function private.apply_inventory_movement();

-- ---------------------------------------------------------------------------
-- Reservas del checkout online
-- ---------------------------------------------------------------------------

create type public.reservation_status as enum ('active', 'consumed', 'released');

create table public.inventory_reservations (
  id          uuid primary key default private.uuid_generate_v7(),
  variant_id  uuid not null references public.product_variants (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  quantity    integer not null check (quantity > 0),
  cart_id     uuid,
  order_id    uuid,
  status      public.reservation_status not null default 'active',
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  released_at timestamptz
);

create index inventory_reservations_cart_id_idx on public.inventory_reservations (cart_id);
create index inventory_reservations_order_id_idx on public.inventory_reservations (order_id);
create index inventory_reservations_variant_id_idx on public.inventory_reservations (variant_id);
create index inventory_reservations_location_id_idx on public.inventory_reservations (location_id);
-- Barrido de pg_cron: solo mira las reservas vivas que ya caducaron.
create index inventory_reservations_sweep_idx on public.inventory_reservations (expires_at)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- Traspasos entre sucursales. Listos desde el día 1 aunque hoy haya una sola:
-- abrir la segunda tienda no debe requerir una migración.
-- ---------------------------------------------------------------------------

create type public.transfer_status as enum ('draft', 'in_transit', 'received', 'cancelled');

create table public.stock_transfers (
  id               uuid primary key default private.uuid_generate_v7(),
  reference        text not null unique,
  from_location_id uuid not null references public.locations (id) on delete restrict,
  to_location_id   uuid not null references public.locations (id) on delete restrict,
  status           public.transfer_status not null default 'draft',
  note             text,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint transfer_between_different_locations
    check (from_location_id <> to_location_id)
);
create index stock_transfers_from_location_id_idx on public.stock_transfers (from_location_id);
create index stock_transfers_to_location_id_idx on public.stock_transfers (to_location_id);
create index stock_transfers_created_by_idx on public.stock_transfers (created_by);

create table public.stock_transfer_lines (
  id          uuid primary key default private.uuid_generate_v7(),
  transfer_id uuid not null references public.stock_transfers (id) on delete cascade,
  variant_id  uuid not null references public.product_variants (id) on delete restrict,
  quantity    integer not null check (quantity > 0),
  unique (transfer_id, variant_id)
);
create index stock_transfer_lines_variant_id_idx on public.stock_transfer_lines (variant_id);

create trigger stock_transfers_set_updated_at before update on public.stock_transfers
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Vistas de alerta que consume el POS
-- ---------------------------------------------------------------------------

create view public.v_stock_alerts
with (security_invoker = true)
as
select
  il.variant_id,
  il.location_id,
  p.id   as product_id,
  p.name as product_name,
  v.sku,
  v.title as variant_title,
  v.bin_location,
  il.on_hand,
  il.reserved,
  il.available,
  v.low_stock_threshold,
  case when il.available <= 0 then 'out_of_stock' else 'low_stock' end as alert
from public.inventory_levels il
join public.product_variants v on v.id = il.variant_id
join public.products p on p.id = v.product_id
where v.is_active
  and p.status = 'active'
  and il.available <= v.low_stock_threshold;

comment on view public.v_stock_alerts is
  'Piezas agotadas o por agotarse. Alimenta las alertas del POS y el reporte diario.';

create view public.v_inventory_valuation
with (security_invoker = true)
as
select
  il.location_id,
  sum(il.on_hand)::bigint                     as units_on_hand,
  sum(il.on_hand * v.cost_cents)::bigint      as cost_value_cents,
  sum(il.on_hand * v.price_cents)::bigint     as retail_value_cents
from public.inventory_levels il
join public.product_variants v on v.id = il.variant_id
group by il.location_id;
