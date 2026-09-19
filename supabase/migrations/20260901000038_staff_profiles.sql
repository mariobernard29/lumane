-- ============================================================================
-- Lumane · 0038 · Alta del personal y sesión del POS
-- ============================================================================
-- El POS no puede arrancar sin dos cosas que hoy no existen: una forma de
-- crear la fila de `profiles` cuando se da de alta a una cajera, y una forma
-- de que la tablet sepa, en UNA llamada, quién ha iniciado sesión, qué puede
-- hacer y si la caja está abierta.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Alta de personal desde el panel de Supabase
--
-- El trigger de la migración 0029 ya se aparta cuando el metadato dice
-- `user_type = 'staff'` —para que una cajera no aparezca como clienta— pero
-- nadie creaba entonces su `profiles`. Aquí se cierra ese hueco.
--
-- Se hace con trigger y no con un RPC porque el alta ocurre en `auth.users`,
-- una tabla que la aplicación no toca: la propietaria crea la cuenta desde el
-- panel de Supabase con el metadato puesto, y el perfil aparece solo. Cuando
-- la Fase 3 traiga la pantalla de personal en el POS, llamará a la API de
-- administración de Auth y este mismo trigger seguirá haciendo su trabajo.
--
-- Metadato esperado al crear el usuario:
--   { "user_type": "staff", "role": "owner", "full_name": "Nombre Apellido" }
--
-- `role` admite owner | manager | cashier; si falta o no existe, se cae a
-- `cashier`, que es el rol con menos permisos. Equivocarse por arriba daría
-- permisos que nadie concedió.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_staff_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_id uuid;
begin
  if coalesce(new.raw_user_meta_data ->> 'user_type', 'customer') <> 'staff' then
    return new;
  end if;

  select r.id into v_role_id
  from public.roles r
  where r.key = coalesce(new.raw_user_meta_data ->> 'role', 'cashier');

  if v_role_id is null then
    select r.id into v_role_id from public.roles r where r.key = 'cashier';
  end if;

  insert into public.profiles (id, full_name, email, role_id, location_id, is_active)
  values (
    new.id,
    coalesce(
      nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
      split_part(new.email, '@', 1)
    ),
    lower(new.email),
    v_role_id,
    (select l.id from public.locations l where l.is_default limit 1),
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function private.handle_new_staff_user() is
  'Crea el perfil del personal cuando el metadato del alta dice user_type=staff.';

create trigger auth_users_create_staff_profile
  after insert on auth.users
  for each row execute function private.handle_new_staff_user();

-- ---------------------------------------------------------------------------
-- 2. Quién soy, qué puedo y cómo está la caja
--
-- La tablet pregunta esto una vez al abrir sesión y en cada arranque. Devolver
-- los permisos ya resueltos evita que la interfaz tenga que adivinar a partir
-- del nombre del rol: el botón de devoluciones se pinta si —y solo si— el
-- permiso está en la lista, igual que lo comprueba el RPC al ejecutarse.
--
-- La interfaz esconde lo que no se puede hacer para no ofrecer callejones sin
-- salida; la autorización REAL la sigue haciendo la base en cada RPC. Un
-- cliente manipulado puede pintarse todos los botones que quiera y seguirá sin
-- poder registrar una devolución.
--
-- `open_session` viene en la misma respuesta porque la pantalla de venta no
-- puede cobrar sin turno abierto, y descubrirlo al pulsar COBRAR es tarde.
-- ---------------------------------------------------------------------------
create or replace function public.get_my_staff_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_result  jsonb;
begin
  select * into v_profile from public.profiles p where p.id = (select auth.uid());

  -- No es un error: es la respuesta correcta a "¿soy personal?" cuando quien
  -- pregunta es una clienta con sesión en la tienda en línea.
  if not found or not v_profile.is_active then
    return null;
  end if;

  select jsonb_build_object(
    'id',          v_profile.id,
    'full_name',   v_profile.full_name,
    'role',        (select jsonb_build_object('key', r.key, 'name', r.name)
                    from public.roles r where r.id = v_profile.role_id),
    'permissions', (select coalesce(jsonb_agg(rp.permission order by rp.permission), '[]'::jsonb)
                    from public.role_permissions rp where rp.role_id = v_profile.role_id),
    'location',    (select jsonb_build_object(
                      'id', l.id, 'code', l.code, 'name', l.name,
                      'address', l.address, 'phone', l.phone)
                    from public.locations l
                    where l.id = coalesce(v_profile.location_id,
                                          (select id from public.locations where is_default limit 1))),
    'open_session', (select to_jsonb(rs)
                     from public.register_sessions rs
                     where rs.status = 'open'
                       and rs.location_id = coalesce(v_profile.location_id,
                             (select id from public.locations where is_default limit 1))
                     limit 1)
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_my_staff_profile() is
  'Perfil, permisos, sucursal y turno abierto del personal autenticado. null si no es personal.';

revoke execute on function public.get_my_staff_profile() from public, anon;
grant execute on function public.get_my_staff_profile() to authenticated;
