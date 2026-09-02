-- ============================================================================
-- Lumane · 0007 · Pedidos, pagos, devoluciones y envíos
-- ============================================================================
-- UNA sola tabla de pedidos para mostrador y tienda en línea, distinguidos por
-- `channel`. Es lo que hace que "las ventas del POS" y "los pedidos web" sean
-- el mismo negocio: un solo historial, un solo reporte, un solo inventario.
--
--   POS    → nace 'completed' + 'paid'. La prenda ya salió de la tienda.
--   Online → recorre placed → preparing → packed → shipped → delivered.
--
-- SNAPSHOTS: cada línea guarda el nombre, SKU, precio y costo tal como eran al
-- vender. Editar un producto en 2027 no puede alterar lo que dice un ticket de
-- 2026 — ni su margen, ni su total, ni su descripción.
--
-- PAGOS MIXTOS: `payments` es una tabla hija, no una columna. Cobrar mitad en
-- efectivo y mitad con tarjeta son simplemente dos filas.
-- ============================================================================

create type public.order_channel as enum ('pos', 'online');

create type public.order_status as enum (
  'draft',      -- carrito del POS aún sin cobrar / pedido online sin pagar
  'placed',     -- pedido nuevo
  'preparing',
  'packed',
  'shipped',
  'delivered',
  'completed',  -- estado terminal de una venta de mostrador
  'cancelled'
);

create type public.payment_status as enum (
  'pending', 'partially_paid', 'paid', 'partially_refunded', 'refunded', 'voided'
);

create type public.payment_method as enum (
  'cash', 'card', 'transfer', 'stripe', 'store_credit'
);

-- Folio legible. El prototipo muestra LM-20482, así que se continúa la serie.
create sequence public.order_number_seq start with 20500;

create table public.orders (
  id               uuid primary key default private.uuid_generate_v7(),
  order_number     text not null unique
                     default ('LM-' || lpad(nextval('public.order_number_seq')::text, 5, '0')),
  channel          public.order_channel not null,
  location_id      uuid not null references public.locations (id) on delete restrict,
  customer_id      uuid references public.customers (id) on delete set null,
  -- Turno de caja al que pertenece la venta (solo POS).
  register_session_id uuid,
  status           public.order_status not null default 'draft',
  payment_status   public.payment_status not null default 'pending',

  -- Importes, todos en centavos y todos con el IVA YA INCLUIDO.
  subtotal_cents   bigint not null default 0 check (subtotal_cents >= 0),
  discount_cents   bigint not null default 0 check (discount_cents >= 0),
  shipping_cents   bigint not null default 0 check (shipping_cents >= 0),
  -- IVA contenido en el total (desglosado, no sumado). Ver private.extract_tax_cents.
  tax_cents        bigint not null default 0 check (tax_cents >= 0),
  total_cents      bigint not null default 0 check (total_cents >= 0),
  currency         text not null default 'MXN',

  coupon_id        uuid references public.coupons (id) on delete set null,
  -- Snapshots: la dirección y el método de envío tal como se eligieron.
  shipping_address jsonb,
  billing_address  jsonb,
  shipping_method_snapshot jsonb,

  note             text,
  -- Permite a una invitada consultar su pedido sin cuenta.
  guest_token      text unique,
  -- Idempotencia: el POS genera este uuid antes de cobrar. Si la tablet pierde
  -- la red y reintenta, el índice único impide duplicar la venta.
  client_uuid      uuid unique,

  placed_at        timestamptz,
  cancelled_at     timestamptz,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index orders_customer_id_idx on public.orders (customer_id);
create index orders_location_id_idx on public.orders (location_id);
create index orders_coupon_id_idx on public.orders (coupon_id);
create index orders_created_by_idx on public.orders (created_by);
create index orders_register_session_id_idx on public.orders (register_session_id);
-- Bandeja de pedidos online del POS: filtra por canal y ordena por llegada.
create index orders_online_queue_idx on public.orders (placed_at desc)
  where channel = 'online';
create index orders_status_idx on public.orders (status, placed_at desc);

create table public.order_lines (
  id             uuid primary key default private.uuid_generate_v7(),
  order_id       uuid not null references public.orders (id) on delete cascade,
  -- Se conservan como referencia, pero pueden quedar en null si el producto se
  -- borra: los snapshots de abajo son los que sostienen el histórico.
  variant_id     uuid references public.product_variants (id) on delete set null,
  product_id     uuid references public.products (id) on delete set null,

  -- ===== Snapshots al momento de la venta =====
  sku            text not null,
  product_name   text not null,
  variant_title  text not null default '',
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  cost_cents     bigint not null default 0 check (cost_cents >= 0),
  tax_rate       numeric(5,4) not null default 0.16,

  quantity       integer not null check (quantity > 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  tax_cents      bigint not null default 0 check (tax_cents >= 0),
  total_cents    bigint not null check (total_cents >= 0),
  position       integer not null default 0,
  created_at     timestamptz not null default now()
);

create index order_lines_order_id_idx on public.order_lines (order_id);
create index order_lines_variant_id_idx on public.order_lines (variant_id);
create index order_lines_product_id_idx on public.order_lines (product_id);

create table public.payments (
  id           uuid primary key default private.uuid_generate_v7(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  method       public.payment_method not null,
  -- Negativo en una devolución: el saldo del pedido es la suma de esta columna.
  amount_cents bigint not null check (amount_cents <> 0),
  -- Solo efectivo: con cuánto pagó y cuánto se le devolvió.
  tendered_cents bigint check (tendered_cents >= 0),
  change_cents   bigint check (change_cents >= 0),
  reference    text,
  provider     text,
  provider_payment_id text,
  status       text not null default 'succeeded',
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index payments_order_id_idx on public.payments (order_id);
create index payments_created_by_idx on public.payments (created_by);
create index payments_provider_payment_id_idx on public.payments (provider_payment_id)
  where provider_payment_id is not null;
-- Corte de caja: suma por método dentro de un rango de fechas.
create index payments_method_created_idx on public.payments (method, created_at);

-- ---------------------------------------------------------------------------
-- Bitácora de estados. Requisito explícito: "cada cambio de estado deberá
-- quedar registrado". Se escribe por trigger, no por la aplicación, para que
-- sea imposible cambiar un estado sin dejar rastro.
-- ---------------------------------------------------------------------------
create table public.order_status_events (
  id          uuid primary key default private.uuid_generate_v7(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status   public.order_status not null,
  note        text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index order_status_events_order_id_created_idx
  on public.order_status_events (order_id, created_at desc);
create index order_status_events_created_by_idx on public.order_status_events (created_by);

create or replace function private.log_order_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_events (order_id, from_status, to_status, created_by)
    values (new.id, null, new.status, new.created_by);
  elsif new.status is distinct from old.status then
    insert into public.order_status_events (order_id, from_status, to_status, created_by)
    values (new.id, old.status, new.status, (select auth.uid()));
  end if;
  return new;
end;
$$;

create trigger orders_log_status_insert
  after insert on public.orders
  for each row execute function private.log_order_status_change();

create trigger orders_log_status_update
  after update of status on public.orders
  for each row execute function private.log_order_status_change();

-- ---------------------------------------------------------------------------
-- Envíos
-- ---------------------------------------------------------------------------

create table public.shipments (
  id                 uuid primary key default private.uuid_generate_v7(),
  order_id           uuid not null references public.orders (id) on delete cascade,
  shipping_method_id uuid references public.shipping_methods (id) on delete set null,
  carrier            text,
  tracking_number    text,
  tracking_url       text,
  shipped_at         timestamptz,
  delivered_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index shipments_order_id_idx on public.shipments (order_id);
create index shipments_shipping_method_id_idx on public.shipments (shipping_method_id);

-- ---------------------------------------------------------------------------
-- Devoluciones. NUNCA modifican la venta original: se registran como un
-- documento nuevo con pagos negativos y movimientos de inventario propios.
-- ---------------------------------------------------------------------------

create type public.return_status as enum ('pending', 'approved', 'completed', 'rejected');

create table public.returns (
  id                 uuid primary key default private.uuid_generate_v7(),
  order_id           uuid not null references public.orders (id) on delete restrict,
  reference          text not null unique
                       default ('DEV-' || lpad(nextval('public.order_number_seq')::text, 5, '0')),
  status             public.return_status not null default 'completed',
  reason             text,
  -- Si la prenda vuelve al inventario o se da de baja (dañada).
  restock            boolean not null default true,
  refund_amount_cents bigint not null default 0 check (refund_amount_cents >= 0),
  refund_method      public.payment_method,
  client_uuid        uuid unique,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now()
);
create index returns_order_id_idx on public.returns (order_id);
create index returns_created_by_idx on public.returns (created_by);

create table public.return_lines (
  id            uuid primary key default private.uuid_generate_v7(),
  return_id     uuid not null references public.returns (id) on delete cascade,
  order_line_id uuid not null references public.order_lines (id) on delete restrict,
  quantity      integer not null check (quantity > 0),
  amount_cents  bigint not null check (amount_cents >= 0),
  unique (return_id, order_line_id)
);
create index return_lines_order_line_id_idx on public.return_lines (order_line_id);

create trigger orders_set_updated_at before update on public.orders
  for each row execute function private.set_updated_at();
create trigger shipments_set_updated_at before update on public.shipments
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Claves foráneas pendientes de tablas creadas antes que `orders`.
-- ---------------------------------------------------------------------------
alter table public.coupon_redemptions
  add constraint coupon_redemptions_order_id_fkey
  foreign key (order_id) references public.orders (id) on delete cascade;

alter table public.inventory_reservations
  add constraint inventory_reservations_order_id_fkey
  foreign key (order_id) references public.orders (id) on delete set null;

alter table public.inventory_reservations
  add constraint inventory_reservations_cart_id_fkey
  foreign key (cart_id) references public.carts (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Métricas de clienta derivadas de los pedidos, nunca almacenadas.
-- ---------------------------------------------------------------------------
create view public.v_customer_stats
with (security_invoker = true)
as
select
  c.id as customer_id,
  count(o.id) filter (where o.status not in ('draft', 'cancelled'))::integer as orders_count,
  coalesce(sum(o.total_cents) filter (where o.status not in ('draft', 'cancelled')), 0)::bigint
    as total_spent_cents,
  max(o.placed_at) as last_order_at
from public.customers c
left join public.orders o on o.customer_id = c.id
group by c.id;

comment on view public.v_customer_stats is
  'Número de compras y monto gastado por clienta. Derivado, nunca desincronizable.';
