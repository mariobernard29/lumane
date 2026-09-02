-- ============================================================================
-- Lumane · 0006 · Cupones y envíos
-- ============================================================================
-- Ni las tarifas de envío ni los rangos de kilómetros de la entrega local
-- viven en el código: son filas editables desde el POS. Cambiar el costo del
-- envío express no debe requerir un despliegue.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Cupones
-- ---------------------------------------------------------------------------

create type public.discount_type as enum ('percentage', 'fixed_amount', 'free_shipping');
create type public.coupon_scope as enum ('all', 'products', 'collections', 'categories');

create table public.coupons (
  id                     uuid primary key default private.uuid_generate_v7(),
  code                   extensions.citext not null unique,
  description            text,
  discount_type          public.discount_type not null,
  -- Solo una de las dos aplica, según discount_type (ver el CHECK de abajo).
  percent_off            numeric(5,2) check (percent_off > 0 and percent_off <= 100),
  amount_off_cents       bigint check (amount_off_cents > 0),
  min_subtotal_cents     bigint not null default 0 check (min_subtotal_cents >= 0),
  scope                  public.coupon_scope not null default 'all',
  -- Canales donde el cupón es válido: {'pos'}, {'online'} o ambos.
  channels               text[] not null default array['pos', 'online'],
  starts_at              timestamptz,
  ends_at                timestamptz,
  -- Null = sin límite. 1 = cupón de un solo uso.
  usage_limit_total      integer check (usage_limit_total > 0),
  usage_limit_per_customer integer check (usage_limit_per_customer > 0),
  -- Contador transaccional; la verdad auditable está en coupon_redemptions.
  times_used             integer not null default 0 check (times_used >= 0),
  is_active              boolean not null default true,
  created_by             uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint coupon_value_matches_type check (
    (discount_type = 'percentage'    and percent_off is not null and amount_off_cents is null) or
    (discount_type = 'fixed_amount'  and amount_off_cents is not null and percent_off is null) or
    (discount_type = 'free_shipping' and percent_off is null and amount_off_cents is null)
  ),
  constraint coupon_window_is_ordered check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index coupons_active_idx on public.coupons (code) where is_active;
create index coupons_created_by_idx on public.coupons (created_by);

-- Restricciones de alcance: a qué productos/colecciones/categorías aplica.
create table public.coupon_targets (
  coupon_id   uuid not null references public.coupons (id) on delete cascade,
  target_type public.coupon_scope not null,
  target_id   uuid not null,
  primary key (coupon_id, target_type, target_id),
  constraint coupon_target_is_specific check (target_type <> 'all')
);

-- Bitácora de uso. Hace cumplir los límites de forma transaccional y permite
-- medir qué cupón funcionó.
create table public.coupon_redemptions (
  id          uuid primary key default private.uuid_generate_v7(),
  coupon_id   uuid not null references public.coupons (id) on delete cascade,
  order_id    uuid not null,
  customer_id uuid references public.customers (id) on delete set null,
  amount_cents bigint not null check (amount_cents >= 0),
  created_at  timestamptz not null default now(),
  -- Un cupón se cuenta una sola vez por pedido.
  unique (coupon_id, order_id)
);
create index coupon_redemptions_customer_id_idx on public.coupon_redemptions (customer_id);
create index coupon_redemptions_order_id_idx on public.coupon_redemptions (order_id);

create trigger coupons_set_updated_at before update on public.coupons
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Métodos de envío
-- ---------------------------------------------------------------------------

create type public.shipping_kind as enum (
  'flat',           -- tarifa fija (estándar, express)
  'local_delivery', -- calculada por distancia con Google Distance Matrix
  'pickup'          -- recoger en boutique
);

create table public.shipping_methods (
  id               uuid primary key default private.uuid_generate_v7(),
  code             text not null unique,
  name             text not null,
  description      text,
  kind             public.shipping_kind not null,
  -- Para 'flat' y 'pickup'. En 'local_delivery' se ignora: manda la tabla de rangos.
  price_cents      bigint not null default 0 check (price_cents >= 0),
  -- Envío gratis a partir de este subtotal. Null = nunca gratis.
  free_over_cents  bigint check (free_over_cents >= 0),
  min_days         integer check (min_days >= 0),
  max_days         integer check (max_days >= 0),
  -- Sucursal de origen: para 'pickup' y 'local_delivery'.
  location_id      uuid references public.locations (id) on delete set null,
  is_active        boolean not null default true,
  position         integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint shipping_days_are_ordered check (max_days is null or min_days is null or max_days >= min_days)
);
create index shipping_methods_active_position_idx on public.shipping_methods (position) where is_active;
create index shipping_methods_location_id_idx on public.shipping_methods (location_id);

-- Rangos de kilómetros de la entrega local. EDITABLES desde el POS: el
-- requisito explícito es que no estén escritos en código.
create table public.local_delivery_rates (
  id                 uuid primary key default private.uuid_generate_v7(),
  shipping_method_id uuid not null references public.shipping_methods (id) on delete cascade,
  min_km             numeric(6,2) not null check (min_km >= 0),
  max_km             numeric(6,2) not null,
  price_cents        bigint not null check (price_cents >= 0),
  position           integer not null default 0,
  constraint local_delivery_range_is_ordered check (max_km > min_km)
);
create index local_delivery_rates_method_idx
  on public.local_delivery_rates (shipping_method_id, min_km);

-- Caché de distancias. Google Distance Matrix se factura por llamada y la
-- distancia entre dos puntos fijos no cambia: se consulta una vez.
create table public.shipping_quotes (
  address_hash     text primary key,
  location_id      uuid not null references public.locations (id) on delete cascade,
  lat              double precision not null,
  lng              double precision not null,
  distance_meters  integer not null check (distance_meters >= 0),
  duration_seconds integer check (duration_seconds >= 0),
  computed_at      timestamptz not null default now()
);
create index shipping_quotes_location_id_idx on public.shipping_quotes (location_id);

create trigger shipping_methods_set_updated_at before update on public.shipping_methods
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Semilla: los cuatro métodos con los costos iniciales acordados.
-- ---------------------------------------------------------------------------

insert into public.shipping_methods
  (code, name, description, kind, price_cents, min_days, max_days, location_id, position)
select * from (values
  ('standard', 'Envío estándar', 'Llega en 3 a 6 días hábiles · guía rastreable',
   'flat'::public.shipping_kind, 14900::bigint, 3, 6, null::uuid, 1),
  ('express', 'Envío express', 'Llega en 2 a 4 días hábiles · guía rastreable',
   'flat'::public.shipping_kind, 21900::bigint, 2, 4, null::uuid, 2)
) as t;

insert into public.shipping_methods
  (code, name, description, kind, price_cents, min_days, max_days, location_id, position)
select 'local', 'Entrega local', 'Solo Los Mochis · el mismo día o al siguiente',
       'local_delivery', 0, 0, 1, l.id, 3
from public.locations l where l.is_default;

insert into public.shipping_methods
  (code, name, description, kind, price_cents, min_days, max_days, location_id, position)
select 'pickup', 'Recoger en boutique', 'Los Mochis · listo en 24 horas',
       'pickup', 0, 1, 1, l.id, 4
from public.locations l where l.is_default;

-- Rangos iniciales de la entrega local (modificables desde el administrador).
insert into public.local_delivery_rates (shipping_method_id, min_km, max_km, price_cents, position)
select m.id, r.min_km, r.max_km, r.price_cents, r.position
from public.shipping_methods m
cross join (values
  (0.00,  3.00,  5000::bigint, 1),
  (3.00,  6.00,  7000::bigint, 2),
  (6.00, 10.00, 10000::bigint, 3),
  (10.00, 15.00, 15000::bigint, 4)
) as r(min_km, max_km, price_cents, position)
where m.code = 'local';
