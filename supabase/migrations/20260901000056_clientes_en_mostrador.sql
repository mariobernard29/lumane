-- ============================================================================
-- Lumane · 0056 · Clientas desde el mostrador
-- ============================================================================
-- La RLS ya permite al personal con `customers.read` / `customers.write` leer
-- y escribir `customers` directamente, así que en teoría la tablet podría
-- hacerlo sin RPC. Estas tres funciones existen por razones concretas, no por
-- costumbre:
--
--   * `pos_upsert_customer` — por el índice único parcial de correo. Un insert
--     con una dirección repetida devuelve `23505` y un mensaje de Postgres
--     ilegible; lo que la cajera necesita oír es «esa señora ya está dada de
--     alta», con su ficha delante para poder asociarla a la venta.
--
--   * `get_customer_profile` — junta ficha, estadísticas, últimas compras,
--     direcciones y favoritas en UNA llamada. Cinco consultas encadenadas
--     desde una tablet con el wifi de la boutique son cinco oportunidades de
--     quedarse a medias.
--
--   * `search_customers` — un orden estable por relevancia. El índice trigram
--     `customers_name_trgm_idx` ya existía desde la Fase 0 y nadie lo usaba.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Las favoritas de una clienta: solo LECTURA para el personal.
--
-- `customer_favorites` únicamente tenía la política de la propia clienta, así
-- que la tablet no podía verlas. Se abre a `select` y nada más: qué le gusta a
-- alguien es suyo, y el mostrador lo consulta para atenderla mejor, no para
-- editarlo.
-- ---------------------------------------------------------------------------
create policy customer_favorites_staff_read
  on public.customer_favorites for select
  to authenticated
  using ((select private.has_permission('customers.read')));

-- ---------------------------------------------------------------------------
-- Buscar
-- ---------------------------------------------------------------------------
create or replace function public.search_customers(
  p_query text,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_busca text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if not private.has_permission('customers.read') then
    raise exception 'No tienes permiso para consultar clientas'
      using errcode = 'insufficient_privilege';
  end if;

  if v_busca is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(fila order by fila.orden, fila.nombre)
    from (
      select c.id,
             c.first_name,
             c.last_name,
             c.email::text as email,
             c.phone,
             btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) as nombre,
             -- Teléfono y correo exactos primero: quien los teclea completos
             -- ya sabe a quién busca. El nombre parcial va después.
             case
               when c.phone = v_busca then 0
               when c.email::text = lower(v_busca) then 0
               else 1
             end as orden
      from public.customers c
      where c.archived_at is null
        and (
          c.phone = v_busca
          or c.email::text ilike '%' || v_busca || '%'
          or btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))
             ilike '%' || v_busca || '%'
        )
      limit greatest(1, least(p_limit, 50))
    ) as fila
  ), '[]'::jsonb);
end;
$$;

comment on function public.search_customers(text, integer) is
  'Busca clientas por nombre, teléfono o correo. Las coincidencias exactas primero.';

-- ---------------------------------------------------------------------------
-- Alta rápida, que también sirve de «encuéntrala»
-- ---------------------------------------------------------------------------
create or replace function public.pos_upsert_customer(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email    text := lower(nullif(btrim(coalesce(p_payload ->> 'email', '')), ''));
  v_phone    text := nullif(btrim(coalesce(p_payload ->> 'phone', '')), '');
  v_nombre   text := nullif(btrim(coalesce(p_payload ->> 'first_name', '')), '');
  v_apellido text := nullif(btrim(coalesce(p_payload ->> 'last_name', '')), '');
  v_cliente  public.customers%rowtype;
begin
  if not private.has_permission('customers.write') then
    raise exception 'No tienes permiso para dar de alta clientas'
      using errcode = 'insufficient_privilege';
  end if;

  if v_nombre is null then
    raise exception 'La clienta necesita al menos un nombre' using errcode = 'check_violation';
  end if;

  -- Si ya existe por correo, se DEVUELVE en lugar de fallar. Es lo que la
  -- cajera quiere oír: «esa señora ya está», con su ficha lista para asociar.
  if v_email is not null then
    select * into v_cliente from public.customers
    where email = v_email::extensions.citext and archived_at is null;

    if found then
      -- Se completa lo que faltara, sin pisar lo que ya había: un teléfono
      -- guardado es un dato que alguien confirmó, y el de hoy puede ser el de
      -- la amiga que vino a recoger.
      update public.customers
      set phone      = coalesce(phone, v_phone),
          last_name  = coalesce(last_name, v_apellido)
      where id = v_cliente.id
      returning * into v_cliente;

      return to_jsonb(v_cliente) || jsonb_build_object('ya_existia', true);
    end if;
  end if;

  -- Por teléfono no se deduplica: dos hermanas pueden dar el de su casa, y
  -- fusionarlas mezclaría dos historiales de compra sin vuelta atrás.
  insert into public.customers (first_name, last_name, email, phone, created_via)
  values (v_nombre, v_apellido, v_email::extensions.citext, v_phone, 'pos')
  returning * into v_cliente;

  return to_jsonb(v_cliente) || jsonb_build_object('ya_existia', false);
end;
$$;

comment on function public.pos_upsert_customer(jsonb) is
  'Da de alta una clienta, o devuelve la existente si el correo ya estaba. Nunca falla por duplicado.';

-- ---------------------------------------------------------------------------
-- La ficha completa
-- ---------------------------------------------------------------------------
create or replace function public.get_customer_profile(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.has_permission('customers.read') then
    raise exception 'No tienes permiso para consultar clientas'
      using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'customer', to_jsonb(c) || jsonb_build_object('email', c.email::text),
    -- `v_customer_stats` existe desde la Fase 0 y nadie la había leído.
    'stats', (select to_jsonb(s) from public.v_customer_stats s where s.customer_id = c.id),
    'recent_orders', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', o.id, 'order_number', o.order_number, 'channel', o.channel,
               'status', o.status, 'total_cents', o.total_cents, 'placed_at', o.placed_at)
             order by o.placed_at desc), '[]'::jsonb)
      from (select * from public.orders
            where customer_id = c.id and status <> 'draft'
            order by placed_at desc limit 10) o
    ),
    'addresses', (
      select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at), '[]'::jsonb)
      from public.customer_addresses a where a.customer_id = c.id
    ),
    'favorites', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'product_id', p.id, 'name', p.name, 'slug', p.slug)
             order by p.name), '[]'::jsonb)
      from public.customer_favorites f
      join public.products p on p.id = f.product_id
      where f.customer_id = c.id
    )
  ) into v_result
  from public.customers c
  where c.id = p_customer_id;

  if v_result is null then
    raise exception 'Esa clienta no existe' using errcode = 'no_data_found';
  end if;

  return v_result;
end;
$$;

comment on function public.get_customer_profile(uuid) is
  'Ficha, estadísticas, últimas compras, direcciones y favoritas en una sola llamada.';

revoke execute on function public.search_customers(text, integer)     from public, anon;
revoke execute on function public.pos_upsert_customer(jsonb)          from public, anon;
revoke execute on function public.get_customer_profile(uuid)          from public, anon;

grant execute on function public.search_customers(text, integer)      to authenticated;
grant execute on function public.pos_upsert_customer(jsonb)           to authenticated;
grant execute on function public.get_customer_profile(uuid)           to authenticated;
