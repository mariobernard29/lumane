-- ============================================================================
-- Lumane · 0005 · Clientas, direcciones, favoritos y carrito
-- ============================================================================
-- UNA sola tabla de clientas para mostrador y tienda en línea. La señora que
-- compra en la boutique hoy y se registra en el sitio dentro de seis meses no
-- debe convertirse en dos personas distintas: al crear la cuenta se vincula
-- `auth_user_id` sobre la fila que ya existe y hereda todo su historial.
--
-- Las métricas (número de compras, monto gastado) NO son columnas: se derivan
-- de los pedidos en una vista. Una columna contadora es una columna que algún
-- día se desincroniza.
-- ============================================================================

create type public.customer_origin as enum ('pos', 'online');

create table public.customers (
  -- Null mientras sea una clienta de mostrador sin cuenta en el sitio.
  auth_user_id     uuid unique references auth.users (id) on delete set null,
  id               uuid primary key default private.uuid_generate_v7(),
  first_name       text not null,
  last_name        text,
  email            extensions.citext,
  phone            text,
  birthday         date,
  notes            text,
  accepts_marketing boolean not null default false,
  created_via      public.customer_origin not null default 'pos',
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- El correo identifica a la clienta, pero en mostrador muchas veces no se pide.
create unique index customers_email_unique_idx on public.customers (email)
  where email is not null and archived_at is null;
create index customers_phone_idx on public.customers (phone) where phone is not null;
-- Búsqueda por nombre en el POS mientras se teclea.
create index customers_name_trgm_idx on public.customers
  using gin ((first_name || ' ' || coalesce(last_name, '')) extensions.gin_trgm_ops);
-- Felicitaciones de cumpleaños (mes/día, sin año).
create index customers_birthday_idx on public.customers
  (extract(month from birthday), extract(day from birthday))
  where birthday is not null;

create table public.customer_addresses (
  id              uuid primary key default private.uuid_generate_v7(),
  customer_id     uuid not null references public.customers (id) on delete cascade,
  label           text,
  recipient       text not null,
  street          text not null,
  ext_no          text,
  int_no          text,
  neighborhood    text,
  city            text not null,
  state           text not null,
  postal_code     text not null,
  country         text not null default 'MX',
  phone           text,
  -- Devueltos por Google Places. lat/lng alimentan el cálculo de entrega local.
  lat             double precision,
  lng             double precision,
  google_place_id text,
  delivery_notes  text,
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index customer_addresses_customer_id_idx on public.customer_addresses (customer_id);
-- Una sola dirección predeterminada por clienta.
create unique index customer_addresses_single_default_idx
  on public.customer_addresses (customer_id) where is_default;

create table public.customer_favorites (
  customer_id uuid not null references public.customers (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (customer_id, product_id)
);
create index customer_favorites_product_id_idx on public.customer_favorites (product_id);

-- ---------------------------------------------------------------------------
-- Carrito persistente
-- ---------------------------------------------------------------------------
-- Invitada  → cookie httpOnly con `token`.
-- Registrada→ `customer_id`. Al iniciar sesión se fusionan (RPC merge_cart).
-- Añadir al carrito NO reserva inventario: ver el razonamiento en 0004.
-- ---------------------------------------------------------------------------

create type public.cart_status as enum ('active', 'converted', 'abandoned');

create table public.carts (
  id          uuid primary key default private.uuid_generate_v7(),
  token       text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  customer_id uuid references public.customers (id) on delete set null,
  status      public.cart_status not null default 'active',
  expires_at  timestamptz not null default (now() + interval '30 days'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index carts_customer_id_idx on public.carts (customer_id) where status = 'active';
create index carts_expires_at_idx on public.carts (expires_at) where status = 'active';

create table public.cart_lines (
  id         uuid primary key default private.uuid_generate_v7(),
  cart_id    uuid not null references public.carts (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  quantity   integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Una línea por variante: sumar cantidades, no duplicar filas.
  unique (cart_id, variant_id)
);
create index cart_lines_variant_id_idx on public.cart_lines (variant_id);

create trigger customers_set_updated_at before update on public.customers
  for each row execute function private.set_updated_at();
create trigger customer_addresses_set_updated_at before update on public.customer_addresses
  for each row execute function private.set_updated_at();
create trigger carts_set_updated_at before update on public.carts
  for each row execute function private.set_updated_at();
create trigger cart_lines_set_updated_at before update on public.cart_lines
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Identidad de la clienta en sesión: base de todas las políticas RLS del
-- storefront. SECURITY DEFINER para poder resolver el id sin exponer la tabla.
-- ---------------------------------------------------------------------------
create or replace function private.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.customers c
  where c.auth_user_id = (select auth.uid()) and c.archived_at is null;
$$;

revoke execute on function private.current_customer_id() from public, anon, authenticated;
