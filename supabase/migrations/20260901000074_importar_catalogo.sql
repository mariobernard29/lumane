-- ============================================================================
-- Lumane · 0074 · Importar el catálogo desde Excel
-- ============================================================================
-- La carga inicial —cientos de prendas con sus tallas, precios y existencias—
-- no se teclea en la tablet: se llena una plantilla de Excel y
-- `scripts/importar-catalogo.mjs` la sube prenda por prenda con esta función.
--
-- POR QUÉ NO ESCRIBE EN LAS TABLAS DIRECTAMENTE. Guardar una prenda ya tiene
-- dueño: `pos_save_product` (0072) decide el slug, las opciones, los valores y
-- qué variantes se apagan; `adjust_inventory` (0057) escribe el movimiento en
-- el libro. Una tercera implementación divergiría a la primera corrección.
-- Así que esta función solo prepara la llamada y llama a esas dos.
--
-- POR QUÉ ACTÚA A NOMBRE DE ALGUIEN. Las dos piden permiso con `auth.uid()`,
-- y el script entra con la llave de servicio, que no es nadie. La función fija
-- el `sub` del JWT, solo dentro de su transacción, al perfil de la dueña (o al
-- que se pase): los permisos se comprueban de verdad y el libro de inventario
-- dice quién cargó las existencias.
--
-- Por eso se ejecuta SOLO con la llave de servicio. Si `authenticated` pudiera
-- llamarla, cualquier cajera podría hacerse pasar por la dueña.
--
-- Idempotente: la prenda se reconoce por su código base y cada variante por su
-- SKU. Volver a importar el mismo archivo corregido actualiza en lugar de
-- duplicar, y las existencias se FIJAN (no se suman): importar dos veces no
-- duplica el inventario.
--
-- payload:
-- {
--   actor?:  uuid,                      -- por omisión, la primera dueña activa
--   product: { name, code, brand?, short_description?, long_description?,
--              materials?, care?, status, is_online,
--              options: [{ name, values: [{ value, code }] }] },
--   category?:    'Vestidos',           -- por nombre; se crea si no existe
--   collections?: ['Básicos Atemporales'],  -- por nombre; deben existir
--   variants: [{ values, sku, barcode?, price_cents, compare_at_price_cents?,
--                cost_cents?, bin_location?, low_stock_threshold?, stock? }]
-- }
-- ============================================================================

create or replace function public.importar_prenda(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor       uuid := nullif(p_payload ->> 'actor', '')::uuid;
  v_product     jsonb := p_payload -> 'product';
  v_code        text := nullif(upper(trim(v_product ->> 'code')), '');
  v_id          uuid;
  v_creada      boolean;
  v_cat_name    text := nullif(trim(p_payload ->> 'category'), '');
  v_cat_id      uuid;
  v_variants    jsonb := '[]'::jsonb;
  v_var         jsonb;
  v_var_id      uuid;
  v_col         text;
  v_col_id      uuid;
  v_cambios     integer := 0;
  v_ajuste      jsonb;
begin
  if v_code is null then
    raise exception 'La prenda necesita un código base para poder reconocerla al reimportar'
      using errcode = 'check_violation';
  end if;

  -- ---- A nombre de quién ----------------------------------------------------
  if v_actor is null then
    select p.id into v_actor
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where r.key = 'owner' and p.is_active
    order by p.created_at
    limit 1;
  end if;
  if v_actor is null then
    raise exception 'No hay ninguna dueña activa a cuyo nombre importar' using errcode = 'no_data_found';
  end if;

  -- `true`: solo para esta transacción. Las dos formas, porque `auth.uid()`
  -- lee una u otra según la versión de PostgREST.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_actor, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_actor::text, true);

  -- ---- Categoría ------------------------------------------------------------
  if v_cat_name is not null then
    select c.id into v_cat_id
    from public.categories c
    where lower(private.f_unaccent(c.name)) = lower(private.f_unaccent(v_cat_name))
       or c.slug = private.slugify(v_cat_name)
    order by (c.name = v_cat_name) desc
    limit 1;

    if v_cat_id is null then
      insert into public.categories (name, slug, position, is_visible)
      values (
        v_cat_name,
        private.slugify(v_cat_name),
        coalesce((select max(position) + 1 from public.categories), 0),
        true
      )
      returning id into v_cat_id;
    end if;
  end if;

  -- ---- ¿Ya existe? ----------------------------------------------------------
  select p.id into v_id from public.products p where upper(p.code) = v_code;
  v_creada := v_id is null;

  -- Cada variante conserva su id si su SKU ya era de esta prenda: así un
  -- reimportado edita en vez de borrar y volver a crear (lo que rompería el
  -- libro de inventario de las que ya se movieron).
  for v_var in select * from jsonb_array_elements(coalesce(p_payload -> 'variants', '[]'::jsonb))
  loop
    v_var_id := null;
    if v_id is not null then
      select pv.id into v_var_id
      from public.product_variants pv
      where pv.product_id = v_id and pv.sku = upper(trim(v_var ->> 'sku'));
    end if;
    v_variants := v_variants || jsonb_build_array(
      v_var || jsonb_build_object('id', v_var_id, 'is_active', true)
    );
  end loop;

  v_id := (public.pos_save_product(
    v_product || jsonb_build_object(
      'id', v_id,
      'code', v_code,
      'category_id', v_cat_id,
      'variants', v_variants
    )
  ) ->> 'id')::uuid;

  -- ---- Lo que `pos_save_product` no guarda ----------------------------------
  for v_var in select * from jsonb_array_elements(v_variants)
  loop
    select pv.id into v_var_id
    from public.product_variants pv
    where pv.product_id = v_id and pv.sku = upper(trim(v_var ->> 'sku'));

    update public.product_variants set
      cost_cents          = coalesce(nullif(v_var ->> 'cost_cents', '')::bigint, cost_cents),
      bin_location        = coalesce(nullif(trim(v_var ->> 'bin_location'), ''), bin_location),
      low_stock_threshold = coalesce(nullif(v_var ->> 'low_stock_threshold', '')::integer, low_stock_threshold)
    where id = v_var_id;

    if nullif(v_var ->> 'stock', '') is not null then
      v_ajuste := public.adjust_inventory(
        v_var_id,
        (v_var ->> 'stock')::integer,
        'Carga del catálogo desde Excel'
      );
      if (v_ajuste ->> 'changed')::boolean then
        v_cambios := v_cambios + 1;
      end if;
    end if;
  end loop;

  -- ---- Colecciones ----------------------------------------------------------
  -- Solo si el archivo trae la columna: `null` deja las que tuviera.
  if p_payload ? 'collections' and jsonb_typeof(p_payload -> 'collections') = 'array' then
    delete from public.product_collections where product_id = v_id;
    for v_col in select * from jsonb_array_elements_text(p_payload -> 'collections')
    loop
      select c.id into v_col_id
      from public.collections c
      where lower(private.f_unaccent(c.name)) = lower(private.f_unaccent(trim(v_col)))
         or c.slug = private.slugify(v_col)
      limit 1;
      if v_col_id is null then
        raise exception 'No existe la colección «%»', trim(v_col) using errcode = 'no_data_found';
      end if;
      insert into public.product_collections (product_id, collection_id, position)
      values (
        v_id, v_col_id,
        coalesce((select max(position) + 1 from public.product_collections where collection_id = v_col_id), 0)
      )
      on conflict do nothing;
    end loop;
  end if;

  return jsonb_build_object(
    'id', v_id,
    'created', v_creada,
    'variants', jsonb_array_length(v_variants),
    'stock_changes', v_cambios
  );
end;
$$;

comment on function public.importar_prenda(jsonb) is
  'Importa una prenda de la plantilla de Excel reutilizando pos_save_product y adjust_inventory. Solo service_role.';

revoke execute on function public.importar_prenda(jsonb) from public, anon, authenticated;
grant  execute on function public.importar_prenda(jsonb) to service_role;
