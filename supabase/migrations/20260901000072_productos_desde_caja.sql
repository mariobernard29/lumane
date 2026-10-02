-- ============================================================================
-- Lumane · 0072 · Productos desde la caja
-- ============================================================================
-- El POS gana un módulo «Productos»: dar de alta, editar, archivar o borrar
-- prendas y categorías desde la tablet, con sus variantes de talla, color o
-- tamaño. Lo que faltaba en la base para eso:
--
--   1. `products.code`: el código base de la prenda («1234»). Las variantes
--      llevan el código base más el de cada valor: «1234-CH», «1234-CH-NEG».
--      Único, pero opcional: las prendas anteriores no lo tienen.
--   2. `product_option_values.code`: el sufijo de cada valor («CH» para
--      Chica). Vive en el valor y no en la variante para que una talla nueva
--      genere sus códigos sola.
--   3. `products.materials` y `products.care`: composición y cuidados, un
--      renglón por línea. La ficha de la tienda los enseña en «Composición y
--      cuidado»; hasta hoy ese bloque era el mismo texto para todas.
--   4. `pos_save_product(payload)`: guarda la prenda, sus opciones, valores y
--      variantes en UNA transacción. Desde la tablet son seis tablas; a mano,
--      un corte de red a mitad dejaría una camisa con tallas sin precio.
--   5. `pos_delete_product(id)`: borra si nunca se movió, archiva si ya tiene
--      historia. El ledger de inventario no admite variantes huérfanas.
--   6. `pos_save_category(...)`: alta y edición con slug generado.
--
-- Todo con `inventory.write`, el mismo permiso que ya gobierna el catálogo en
-- las políticas RLS (0011) y en el admin web: dueña y encargada, no cajera.
-- ============================================================================

alter table public.products
  add column code      text,
  add column materials text,
  add column care      text;

create unique index products_code_key on public.products (upper(code)) where code is not null;

comment on column public.products.code is
  'Código base de la prenda. Los SKU de sus variantes son este código más el sufijo de cada valor (1234-CH).';
comment on column public.products.materials is
  'Composición, un renglón por línea («Algodón 100%»). Se enseña en la ficha de la tienda.';
comment on column public.products.care is
  'Cuidados, un renglón por línea («Lavar a mano con agua fría»). Se enseña en la ficha de la tienda.';

alter table public.product_option_values add column code text;

comment on column public.product_option_values.code is
  'Sufijo del valor en el SKU de la variante: CH para Chica, NEG para Negro.';

-- ---------------------------------------------------------------------------
-- 1. Guardar una prenda completa
-- ---------------------------------------------------------------------------
-- payload:
-- {
--   id?, name, code, brand?, short_description?, long_description?,
--   materials?, care?, category_id?, status: 'active'|'draft'|'archived',
--   is_online: bool,
--   options: [{ name, values: [{ value, code }] }],          -- en orden
--   variants: [{
--     id?,                       -- la que ya existía, si es la misma
--     values: ['Chica', 'Negro'] -- un valor por opción, en el orden de options
--     sku, barcode?, price_cents, compare_at_price_cents?, is_active
--   }]
-- }
--
-- Las variantes que ya no vienen se BORRAN si nunca tuvieron movimiento de
-- inventario y se APAGAN si lo tuvieron: el ledger las referencia con
-- `on delete restrict`, y una venta de hace un año tiene que seguir diciendo
-- qué se vendió.
-- ---------------------------------------------------------------------------
create or replace function public.pos_save_product(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id         uuid := nullif(p_payload ->> 'id', '')::uuid;
  v_name       text := nullif(trim(p_payload ->> 'name'), '');
  v_code       text := nullif(upper(trim(p_payload ->> 'code')), '');
  v_status     public.product_status := coalesce((p_payload ->> 'status')::public.product_status, 'active');
  v_slug       text;
  v_opt        jsonb;
  v_val        jsonb;
  v_var        jsonb;
  v_opt_id     uuid;
  v_val_id     uuid;
  v_var_id     uuid;
  v_opt_pos    integer := 0;
  v_val_pos    integer;
  v_var_pos    integer := 0;
  v_keep_vars  uuid[] := '{}';
  v_keep_opts  uuid[] := '{}';
  v_keep_vals  uuid[] := '{}';
  v_opt_ids    uuid[];
  v_values     text[];
  v_title      text;
  i            integer;
begin
  if not private.has_permission('inventory.write') then
    raise exception 'No tienes permiso para editar el catálogo' using errcode = 'insufficient_privilege';
  end if;

  if v_name is null then
    raise exception 'La prenda necesita un nombre' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(coalesce(p_payload -> 'variants', '[]'::jsonb)) = 0 then
    raise exception 'La prenda necesita al menos una variante' using errcode = 'check_violation';
  end if;

  -- ---- La prenda -----------------------------------------------------------
  if v_id is null then
    -- Slug a partir del nombre; si ya existe, se le añade el código o un
    -- número. La tablet no pide slug: es un detalle de la tienda en línea.
    v_slug := private.slugify(v_name);
    if v_slug = '' then v_slug := 'prenda'; end if;
    if exists (select 1 from public.products where slug = v_slug) then
      v_slug := v_slug || '-' || coalesce(private.slugify(v_code), '');
      v_slug := trim(both '-' from v_slug);
      i := 2;
      while exists (select 1 from public.products where slug = v_slug) loop
        v_slug := private.slugify(v_name) || '-' || i;
        i := i + 1;
      end loop;
    end if;

    insert into public.products (
      name, slug, code, brand, short_description, long_description, materials, care,
      primary_category_id, status, is_online, published_at, archived_at, created_by
    ) values (
      v_name, v_slug, v_code,
      nullif(trim(p_payload ->> 'brand'), ''),
      nullif(trim(p_payload ->> 'short_description'), ''),
      nullif(trim(p_payload ->> 'long_description'), ''),
      nullif(trim(p_payload ->> 'materials'), ''),
      nullif(trim(p_payload ->> 'care'), ''),
      nullif(p_payload ->> 'category_id', '')::uuid,
      v_status,
      coalesce((p_payload ->> 'is_online')::boolean, true),
      case when v_status = 'active' then now() end,
      case when v_status = 'archived' then now() end,
      (select auth.uid())
    )
    returning id into v_id;
  else
    update public.products set
      name                = v_name,
      code                = v_code,
      brand               = nullif(trim(p_payload ->> 'brand'), ''),
      short_description   = nullif(trim(p_payload ->> 'short_description'), ''),
      long_description    = nullif(trim(p_payload ->> 'long_description'), ''),
      materials           = nullif(trim(p_payload ->> 'materials'), ''),
      care                = nullif(trim(p_payload ->> 'care'), ''),
      primary_category_id = nullif(p_payload ->> 'category_id', '')::uuid,
      status              = v_status,
      is_online           = coalesce((p_payload ->> 'is_online')::boolean, is_online),
      -- Se sella la PRIMERA vez que sale activa, como en el admin web.
      published_at        = coalesce(published_at, case when v_status = 'active' then now() end),
      archived_at         = case when v_status = 'archived' then coalesce(archived_at, now()) end
    where id = v_id;

    if not found then
      raise exception 'Esa prenda no existe' using errcode = 'no_data_found';
    end if;
  end if;

  -- La categoría también va en la tabla de pertenencia, que es la que usa el
  -- catálogo de la tienda para filtrar.
  delete from public.product_categories where product_id = v_id;
  if nullif(p_payload ->> 'category_id', '') is not null then
    insert into public.product_categories (product_id, category_id)
    values (v_id, (p_payload ->> 'category_id')::uuid);
  end if;

  -- ---- Opciones y valores --------------------------------------------------
  v_opt_ids := '{}';
  for v_opt in select * from jsonb_array_elements(coalesce(p_payload -> 'options', '[]'::jsonb))
  loop
    insert into public.product_options (product_id, name, position)
    values (v_id, trim(v_opt ->> 'name'), v_opt_pos)
    on conflict (product_id, name) do update set position = excluded.position
    returning id into v_opt_id;

    v_opt_ids := v_opt_ids || v_opt_id;
    v_keep_opts := v_keep_opts || v_opt_id;
    v_opt_pos := v_opt_pos + 1;

    v_val_pos := 0;
    for v_val in select * from jsonb_array_elements(coalesce(v_opt -> 'values', '[]'::jsonb))
    loop
      insert into public.product_option_values (option_id, value, code, position)
      values (v_opt_id, trim(v_val ->> 'value'), nullif(upper(trim(v_val ->> 'code')), ''), v_val_pos)
      on conflict (option_id, value) do update
        set code = excluded.code, position = excluded.position
      returning id into v_val_id;

      v_keep_vals := v_keep_vals || v_val_id;
      v_val_pos := v_val_pos + 1;
    end loop;
  end loop;

  -- ---- Variantes -----------------------------------------------------------
  for v_var in select * from jsonb_array_elements(p_payload -> 'variants')
  loop
    select coalesce(array_agg(x order by n), '{}') into v_values
    from jsonb_array_elements_text(coalesce(v_var -> 'values', '[]'::jsonb)) with ordinality as t(x, n);

    if coalesce(array_length(v_values, 1), 0) <> coalesce(array_length(v_opt_ids, 1), 0) then
      raise exception 'Cada variante necesita un valor por opción' using errcode = 'check_violation';
    end if;

    v_title := array_to_string(v_values, ' / ');
    v_var_id := nullif(v_var ->> 'id', '')::uuid;

    if v_var_id is not null then
      update public.product_variants set
        title                  = v_title,
        sku                    = upper(trim(v_var ->> 'sku')),
        barcode                = nullif(trim(v_var ->> 'barcode'), ''),
        price_cents            = (v_var ->> 'price_cents')::bigint,
        compare_at_price_cents = nullif(v_var ->> 'compare_at_price_cents', '')::bigint,
        is_active              = coalesce((v_var ->> 'is_active')::boolean, true),
        position               = v_var_pos
      where id = v_var_id and product_id = v_id;

      if not found then
        raise exception 'Una de las variantes no pertenece a esta prenda' using errcode = 'no_data_found';
      end if;
    else
      insert into public.product_variants (
        product_id, title, sku, barcode, price_cents, compare_at_price_cents, is_active, position
      ) values (
        v_id, v_title, upper(trim(v_var ->> 'sku')),
        nullif(trim(v_var ->> 'barcode'), ''),
        (v_var ->> 'price_cents')::bigint,
        nullif(v_var ->> 'compare_at_price_cents', '')::bigint,
        coalesce((v_var ->> 'is_active')::boolean, true),
        v_var_pos
      )
      returning id into v_var_id;
    end if;

    v_keep_vars := v_keep_vars || v_var_id;
    v_var_pos := v_var_pos + 1;

    -- Los valores de la variante se reescriben: es más simple que comparar y
    -- el resultado es el mismo.
    delete from public.variant_option_values where variant_id = v_var_id;
    for i in 1 .. coalesce(array_length(v_opt_ids, 1), 0) loop
      select pov.id into v_val_id
      from public.product_option_values pov
      where pov.option_id = v_opt_ids[i] and pov.value = trim(v_values[i]);

      if v_val_id is null then
        raise exception 'El valor «%» no está entre los de la opción', v_values[i]
          using errcode = 'check_violation';
      end if;

      insert into public.variant_option_values (variant_id, option_value_id) values (v_var_id, v_val_id);
    end loop;
  end loop;

  -- ---- Lo que ya no viene --------------------------------------------------
  -- Variantes sin historia: fuera. Con historia: apagadas y sin valores, para
  -- que no estorben a las opciones que sí se quitaron.
  delete from public.product_variants pv
  where pv.product_id = v_id
    and pv.id <> all (v_keep_vars)
    and not exists (select 1 from public.inventory_movements m where m.variant_id = pv.id);

  update public.product_variants pv set is_active = false
  where pv.product_id = v_id and pv.id <> all (v_keep_vars);

  delete from public.variant_option_values vov
  using public.product_variants pv
  where vov.variant_id = pv.id and pv.product_id = v_id and pv.id <> all (v_keep_vars);

  delete from public.product_option_values pov
  using public.product_options po
  where pov.option_id = po.id and po.product_id = v_id and pov.id <> all (v_keep_vals);

  delete from public.product_options where product_id = v_id and id <> all (v_keep_opts);

  return jsonb_build_object('id', v_id);
exception
  when unique_violation then
    -- El único único que la tablet puede pisar es el SKU (o el código base).
    raise exception 'Ese código ya lo usa otra prenda. Cambia el código base o el sufijo.'
      using errcode = 'unique_violation';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Borrar o archivar
-- ---------------------------------------------------------------------------
create or replace function public.pos_delete_product(p_product_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('inventory.write') then
    raise exception 'No tienes permiso para editar el catálogo' using errcode = 'insufficient_privilege';
  end if;

  if exists (
    select 1 from public.inventory_movements m
    join public.product_variants pv on pv.id = m.variant_id
    where pv.product_id = p_product_id
  ) or exists (
    select 1 from public.order_lines ol
    join public.product_variants pv on pv.id = ol.variant_id
    where pv.product_id = p_product_id
  ) then
    update public.products
    set status = 'archived', archived_at = coalesce(archived_at, now())
    where id = p_product_id;
    return jsonb_build_object('archived', true);
  end if;

  delete from public.products where id = p_product_id;
  if not found then
    raise exception 'Esa prenda no existe' using errcode = 'no_data_found';
  end if;
  return jsonb_build_object('archived', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Categorías
-- ---------------------------------------------------------------------------
create or replace function public.pos_save_category(
  p_id        uuid,
  p_name      text,
  p_parent_id uuid default null,
  p_is_visible boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id   uuid := p_id;
  v_name text := nullif(trim(p_name), '');
  v_slug text;
  i      integer := 2;
begin
  if not private.has_permission('inventory.write') then
    raise exception 'No tienes permiso para editar el catálogo' using errcode = 'insufficient_privilege';
  end if;
  if v_name is null then
    raise exception 'La categoría necesita un nombre' using errcode = 'check_violation';
  end if;
  if p_parent_id is not null and p_parent_id = p_id then
    raise exception 'Una categoría no puede ser su propia madre' using errcode = 'check_violation';
  end if;

  if v_id is null then
    v_slug := private.slugify(v_name);
    while exists (select 1 from public.categories where slug = v_slug) loop
      v_slug := private.slugify(v_name) || '-' || i;
      i := i + 1;
    end loop;

    insert into public.categories (name, slug, parent_id, is_visible, position)
    values (v_name, v_slug, p_parent_id, p_is_visible,
            coalesce((select max(position) + 1 from public.categories), 0))
    returning id into v_id;
  else
    -- El slug NO cambia al renombrar: es la dirección pública de la
    -- categoría y romperla rompe los enlaces que ya circulan.
    update public.categories
    set name = v_name, parent_id = p_parent_id, is_visible = p_is_visible
    where id = v_id;
    if not found then
      raise exception 'Esa categoría no existe' using errcode = 'no_data_found';
    end if;
  end if;

  return jsonb_build_object('id', v_id);
end;
$$;

do $$
declare sig text;
begin
  foreach sig in array array[
    'public.pos_save_product(jsonb)',
    'public.pos_delete_product(uuid)',
    'public.pos_save_category(uuid, text, uuid, boolean)'
  ] loop
    execute format('revoke execute on function %s from public, anon', sig);
    execute format('grant execute on function %s to authenticated', sig);
  end loop;
end $$;
