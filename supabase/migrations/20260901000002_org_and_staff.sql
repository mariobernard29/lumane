-- ============================================================================
-- Lumane · 0002 · Sucursales, roles, permisos y personal
-- ============================================================================
-- Lumane arranca con UNA sucursal y UNA usuaria (owner), pero el modelo ya es
-- multi-sucursal y multi-rol: crecer es insertar filas, no migrar el esquema.
--
--   locations         → sucursales. Origen del cálculo de entrega local.
--   roles             → owner / manager / cashier (ampliable).
--   role_permissions  → permisos como texto libre ('sales.refund', ...).
--   profiles          → personal, 1:1 con auth.users.
--
-- Los helpers de autorización son SECURITY DEFINER y viven en `private`:
-- las políticas RLS los invocan como `(select private.has_permission('x'))`
-- para que Postgres los evalúe UNA vez por consulta y no una vez por fila.
-- ============================================================================

create table public.locations (
  id            uuid primary key default private.uuid_generate_v7(),
  code          text not null unique,
  name          text not null,
  address       jsonb not null default '{}'::jsonb,
  phone         text,
  -- Punto de origen para Google Distance Matrix (entrega local).
  lat           double precision,
  lng           double precision,
  timezone      text not null default 'America/Mazatlan',
  is_default    boolean not null default false,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Solo puede haber una sucursal marcada como predeterminada.
create unique index locations_single_default_idx
  on public.locations ((true)) where is_default;

create table public.roles (
  id          uuid primary key default private.uuid_generate_v7(),
  key         text not null unique,
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table public.role_permissions (
  role_id    uuid not null references public.roles (id) on delete cascade,
  permission text not null,
  primary key (role_id, permission)
);

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  email       extensions.citext,
  role_id     uuid not null references public.roles (id),
  location_id uuid references public.locations (id),
  -- PIN para cambio rápido de cajera en la tablet (bcrypt). Hoy sin uso.
  pin_hash    text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index profiles_role_id_idx on public.profiles (role_id);
create index profiles_location_id_idx on public.profiles (location_id);

create trigger locations_set_updated_at before update on public.locations
  for each row execute function private.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers de autorización
-- ---------------------------------------------------------------------------

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active
  );
$$;

create or replace function private.has_permission(perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.role_permissions rp on rp.role_id = p.role_id
    where p.id = (select auth.uid())
      and p.is_active
      and (rp.permission = perm or rp.permission = '*')
  );
$$;

comment on function private.has_permission(text) is
  'Autorización del personal. El permiso comodín ''*'' concede todo (rol owner).';

create or replace function private.current_location_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.location_id from public.profiles p where p.id = (select auth.uid())),
    (select l.id from public.locations l where l.is_default limit 1)
  );
$$;

revoke execute on function private.is_staff() from public, anon, authenticated;
revoke execute on function private.has_permission(text) from public, anon, authenticated;
revoke execute on function private.current_location_id() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Semilla mínima: la boutique y los tres roles previstos.
-- ---------------------------------------------------------------------------

insert into public.locations (code, name, address, phone, lat, lng, is_default)
values (
  'MOCHIS',
  'Lumane Los Mochis',
  jsonb_build_object(
    'street', '', 'neighborhood', '', 'city', 'Los Mochis',
    'state', 'Sinaloa', 'postal_code', '', 'country', 'MX'
  ),
  null,
  25.7935, -108.9975,
  true
);

insert into public.roles (key, name, description) values
  ('owner',   'Propietaria', 'Acceso total al sistema'),
  ('manager', 'Encargada',   'Ventas, caja, inventario y tienda en línea'),
  ('cashier', 'Cajera',      'Ventas y caja del turno');

insert into public.role_permissions (role_id, permission)
select r.id, '*' from public.roles r where r.key = 'owner';

insert into public.role_permissions (role_id, permission)
select r.id, perm
from public.roles r
cross join unnest(array[
  'sales.create', 'sales.refund', 'sales.void', 'sales.discount',
  'register.open', 'register.close', 'register.movement',
  'inventory.read', 'inventory.adjust', 'inventory.transfer', 'inventory.write',
  'customers.read', 'customers.write',
  'coupons.read', 'coupons.write',
  'orders.read', 'orders.fulfill',
  'cms.read', 'cms.write',
  'reports.read'
]) as perm
where r.key = 'manager';

insert into public.role_permissions (role_id, permission)
select r.id, perm
from public.roles r
cross join unnest(array[
  'sales.create', 'sales.discount',
  'register.open', 'register.close', 'register.movement',
  'inventory.read',
  'customers.read', 'customers.write',
  'orders.read'
]) as perm
where r.key = 'cashier';
