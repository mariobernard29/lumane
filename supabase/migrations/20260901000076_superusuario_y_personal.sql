-- ============================================================================
-- Lumane · 0076 · Superusuaria y alta/baja del personal desde el panel
-- ============================================================================
-- Hasta aquí, dar de alta a una cajera exigía entrar al panel de Supabase y
-- escribir el metadato a mano (0038). Desde ahora lo hace la superusuaria en
-- /admin/personal, sin llamar a nadie.
--
-- **Superusuaria no es un rol.** Es una marca en `profiles` que hoy solo tiene
-- la cuenta de Lumane (lumane.mx@gmail.com). Los roles siguen siendo lo que
-- se PUEDE hacer en la tienda; la marca es quién administra al personal. Así
-- se puede dar el rol de Propietaria a una socia sin darle, además, el poder
-- de quitarle el acceso a la dueña.
--
-- **Se cierra un hueco de la 0011.** `profiles_self_update` dejaba a cualquier
-- persona del personal actualizar SU fila entera, `role_id` incluido: una
-- cajera podía nombrarse propietaria con una llamada a la API. Y
-- `profiles_admin_all` dejaba a cualquier propietaria escribir cualquier
-- perfil, también la marca nueva. Ninguna pantalla escribe `profiles`
-- directamente, así que las dos se quitan: el personal se cambia solo con las
-- funciones de abajo, que comprueban la marca antes de tocar nada.
--
-- Lo que no puede hacer SQL —crear la cuenta en `auth.users`, ponerle
-- contraseña o bloquear su sesión— lo hace el panel con la API de
-- administración de Auth, y solo después de que `get_my_staff_profile` diga
-- que quien lo pide es superusuaria.
-- ============================================================================

alter table public.profiles
  add column is_superuser boolean not null default false;

comment on column public.profiles.is_superuser is
  'Administra al personal (altas, bajas, roles). No se cambia desde la app: solo por migración.';

update public.profiles
set is_superuser = true
where lower(email::text) = 'lumane.mx@gmail.com';

-- ---------------------------------------------------------------------------
-- 1. Nadie escribe `profiles` por la API; leer sigue igual
-- ---------------------------------------------------------------------------
drop policy if exists profiles_self_update on public.profiles;
drop policy if exists profiles_admin_all on public.profiles;

-- Quien administra (propietaria) sigue viendo al equipo, como antes.
create policy profiles_admin_read on public.profiles
  for select to authenticated
  using ((select private.has_permission('*')));

-- Defensa extra: aunque alguien añadiera una política por error, el rol
-- `authenticated` no tiene privilegio de escritura sobre la tabla.
revoke insert, update, delete on public.profiles from authenticated, anon;

create or replace function private.is_superuser()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active and p.is_superuser
  );
$$;

revoke execute on function private.is_superuser() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. El perfil del personal dice si es superusuaria
--
-- Igual que la 0038, con `is_superuser` añadido. El panel lo usa para enseñar
-- la sección Personal; la autorización de verdad está en las funciones.
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

  if not found or not v_profile.is_active then
    return null;
  end if;

  select jsonb_build_object(
    'id',           v_profile.id,
    'full_name',    v_profile.full_name,
    'is_superuser', v_profile.is_superuser,
    'role',         (select jsonb_build_object('key', r.key, 'name', r.name)
                     from public.roles r where r.id = v_profile.role_id),
    'permissions',  (select coalesce(jsonb_agg(rp.permission order by rp.permission), '[]'::jsonb)
                     from public.role_permissions rp where rp.role_id = v_profile.role_id),
    'location',     (select jsonb_build_object(
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

-- ---------------------------------------------------------------------------
-- 3. La lista del personal, para la superusuaria
-- ---------------------------------------------------------------------------
create or replace function public.list_staff()
returns table (
  id            uuid,
  full_name     text,
  email         text,
  role_key      text,
  role_name     text,
  is_active     boolean,
  is_superuser  boolean,
  last_sign_in  timestamptz,
  created_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_superuser() then
    raise exception 'Solo la superusuaria administra al personal'
      using errcode = '42501';
  end if;

  return query
  select p.id, p.full_name, p.email::text, r.key, r.name, p.is_active, p.is_superuser,
         u.last_sign_in_at, p.created_at
  from public.profiles p
  join public.roles r on r.id = p.role_id
  left join auth.users u on u.id = p.id
  order by p.is_active desc, p.is_superuser desc, p.full_name;
end;
$$;

revoke execute on function public.list_staff() from public, anon;
grant execute on function public.list_staff() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Cambiar nombre, rol o estado de una persona
--
-- La superusuaria no se puede quitar el acceso ni cambiar de rol a sí misma
-- (ni a otra superusuaria): una tienda sin nadie que administre al personal
-- solo se arregla desde Supabase.
-- ---------------------------------------------------------------------------
create or replace function public.update_staff(
  p_id        uuid,
  p_full_name text default null,
  p_role      text default null,
  p_is_active boolean default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_target  public.profiles%rowtype;
  v_role_id uuid;
begin
  if not private.is_superuser() then
    raise exception 'Solo la superusuaria administra al personal'
      using errcode = '42501';
  end if;

  select * into v_target from public.profiles where id = p_id for update;
  if not found then
    raise exception 'No existe esa persona en el personal' using errcode = 'P0002';
  end if;

  if v_target.is_superuser and (p_role is not null or p_is_active is not null) then
    raise exception 'A la superusuaria no se le cambia el rol ni se le quita el acceso'
      using errcode = '42501';
  end if;

  if p_role is not null then
    select r.id into v_role_id from public.roles r where r.key = p_role;
    if v_role_id is null then
      raise exception 'El rol % no existe', p_role using errcode = '22023';
    end if;
  end if;

  if p_full_name is not null and btrim(p_full_name) = '' then
    raise exception 'El nombre no puede quedar vacío' using errcode = '22023';
  end if;

  update public.profiles
  set full_name = coalesce(nullif(btrim(p_full_name), ''), full_name),
      role_id   = coalesce(v_role_id, role_id),
      is_active = coalesce(p_is_active, is_active)
  where id = p_id
  returning * into v_target;

  return jsonb_build_object(
    'id', v_target.id,
    'full_name', v_target.full_name,
    'is_active', v_target.is_active
  );
end;
$$;

revoke execute on function public.update_staff(uuid, text, text, boolean) from public, anon;
grant execute on function public.update_staff(uuid, text, text, boolean) to authenticated;
