-- ============================================================================
-- Lumane · 0029 · Cuentas de clienta
-- ============================================================================
-- Faltaban tres piezas para que el área de clienta funcione:
--
-- 1. NADIE creaba la fila en `customers` al registrarse. Sin ella,
--    `private.current_customer_id()` devuelve null y la cuenta aparece vacía
--    aunque la sesión sea válida.
--
-- 2. La política `customers_self_update` permitía a la clienta escribir
--    CUALQUIER columna de su fila: `notes` (notas internas de la boutique),
--    `created_via` y `archived_at` incluidos. RLS filtra filas, no columnas, así
--    que se sustituye por un RPC que solo toca lo que es suyo.
--
-- 3. Guardar una segunda dirección predeterminada chocaba con el índice único
--    y devolvía un error de constraint en lugar de hacer lo obvio: mover la
--    marca de una dirección a la otra.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Al registrarse, crear o VINCULAR la fila de clienta
-- ---------------------------------------------------------------------------
-- Si ya existe una clienta con ese correo —porque compró en el mostrador y la
-- cajera la registró— NO se crea una segunda: se vincula. Es la promesa de
-- "una sola tabla de clientas": llega a la tienda en línea y encuentra su
-- historial de compras de la boutique ya ahí.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email extensions.citext := lower(new.email);
  v_first text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), '');
  v_last  text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), '');
  v_existing uuid;
begin
  -- El personal del POS lo da de alta la propietaria, no se autorregistra, y
  -- no debe aparecer como clienta.
  if coalesce(new.raw_user_meta_data ->> 'user_type', 'customer') = 'staff' then
    return new;
  end if;

  select c.id into v_existing
  from public.customers c
  where c.email = v_email and c.archived_at is null and c.auth_user_id is null;

  if v_existing is not null then
    update public.customers
    set auth_user_id = new.id,
        first_name = coalesce(v_first, first_name),
        last_name  = coalesce(v_last, last_name),
        updated_at = now()
    where id = v_existing;
    return new;
  end if;

  insert into public.customers (auth_user_id, email, first_name, last_name, created_via)
  values (new.id, v_email, coalesce(v_first, 'Clienta'), v_last, 'online')
  -- Un reintento del registro no debe reventar el alta de la cuenta.
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

create trigger auth_users_create_customer
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- 2. Datos personales: solo las columnas que son de la clienta
-- ---------------------------------------------------------------------------
drop policy if exists customers_self_update on public.customers;

create or replace function public.update_my_profile(
  p_first_name       text default null,
  p_last_name        text default null,
  p_phone            text default null,
  p_birthday         date default null,
  p_accepts_marketing boolean default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := private.current_customer_id();
  c public.customers%rowtype;
begin
  if v_customer_id is null then
    raise exception 'Necesitas iniciar sesión' using errcode = 'insufficient_privilege';
  end if;

  if p_first_name is not null and btrim(p_first_name) = '' then
    raise exception 'El nombre no puede quedar vacío' using errcode = 'check_violation';
  end if;

  -- `coalesce` deja pasar solo lo que se envía: un campo omitido no se borra.
  -- `notes`, `created_via`, `archived_at` y `auth_user_id` no se tocan nunca
  -- desde aquí: son de la boutique, no de la clienta.
  update public.customers
  set first_name        = coalesce(nullif(btrim(p_first_name), ''), first_name),
      last_name         = coalesce(p_last_name, last_name),
      phone             = coalesce(p_phone, phone),
      birthday          = coalesce(p_birthday, birthday),
      accepts_marketing = coalesce(p_accepts_marketing, accepts_marketing),
      updated_at        = now()
  where id = v_customer_id
  returning * into c;

  return jsonb_build_object(
    'first_name', c.first_name,
    'last_name', c.last_name,
    'phone', c.phone,
    'birthday', c.birthday,
    'accepts_marketing', c.accepts_marketing
  );
end;
$$;

revoke execute on function public.update_my_profile(text, text, text, date, boolean) from public, anon;
grant execute on function public.update_my_profile(text, text, text, date, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Una sola dirección predeterminada, sin errores de constraint
-- ---------------------------------------------------------------------------
create or replace function private.enforce_single_default_address()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_default then
    update public.customer_addresses
    set is_default = false, updated_at = now()
    where customer_id = new.customer_id
      and id <> new.id
      and is_default;
  end if;
  return new;
end;
$$;

create trigger customer_addresses_single_default
  before insert or update of is_default on public.customer_addresses
  for each row execute function private.enforce_single_default_address();

comment on function private.enforce_single_default_address() is
  'Mueve la marca de predeterminada en lugar de dejar que choque con el índice único.';

-- ---------------------------------------------------------------------------
-- 4. Historial de pedidos de la clienta, con lo justo para la lista
-- ---------------------------------------------------------------------------
create or replace function public.get_my_orders(p_limit integer default 20)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(o order by o.placed_at desc nulls last), '[]'::jsonb)
  from (
    select
      ord.order_number,
      ord.status,
      ord.payment_status,
      ord.total_cents,
      ord.placed_at,
      ord.guest_token,
      (select count(*) from public.order_lines ol where ol.order_id = ord.id)::integer as items,
      (select pi.storage_path
       from public.order_lines ol
       join public.product_images pi on pi.product_id = ol.product_id
       where ol.order_id = ord.id
       order by ol.position, pi.position
       limit 1) as image_path
    from public.orders ord
    where ord.customer_id = private.current_customer_id()
      and ord.status <> 'draft'
    order by ord.placed_at desc nulls last
    limit greatest(p_limit, 0)
  ) o;
$$;

revoke execute on function public.get_my_orders(integer) from public, anon;
grant execute on function public.get_my_orders(integer) to authenticated;
