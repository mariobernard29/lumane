-- ============================================================================
-- Lumane · 0016 · Corrección crítica del proyector de inventario
-- ============================================================================
-- BUG: la versión anterior de private.apply_inventory_movement() aplicaba el
-- delta con un solo `insert ... on conflict do update`:
--
--     insert into inventory_levels (variant_id, location_id, on_hand)
--     values (new.variant_id, new.location_id, new.quantity_delta)
--     on conflict (...) do update set on_hand = il.on_hand + excluded.on_hand;
--
-- Postgres evalúa los CHECK de tabla sobre la FILA PROPUESTA para inserción
-- ANTES de resolver el conflicto. Con un movimiento de venta (delta negativo),
-- la fila propuesta llevaba on_hand = -N y chocaba con
-- `check (on_hand >= 0 ...)` aunque la fila real tuviera stum de sobra.
--
-- Consecuencia: NINGUNA venta podía registrarse. Y peor: la prueba de
-- "sobreventa bloqueada" pasaba por el motivo equivocado — fallaba siempre,
-- hubiera stock o no.
--
-- CORRECCIÓN: separar en dos pasos.
--   1. Asegurar que la fila existe, proponiendo on_hand = 0 (siempre válido).
--   2. Aplicar el delta con un UPDATE, donde el CHECK evalúa el valor REAL
--      resultante. Ahí sí, y solo ahí, debe rechazarse la sobreventa.
-- ============================================================================

create or replace function private.apply_inventory_movement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Paso 1: la fila de nivel debe existir. Se propone on_hand = 0, que nunca
  -- viola el CHECK, y no se toca nada si ya estaba.
  insert into public.inventory_levels (variant_id, location_id, on_hand)
  values (new.variant_id, new.location_id, 0)
  on conflict (variant_id, location_id) do nothing;

  -- Paso 2: aplicar el delta. El UPDATE toma el lock de fila y el CHECK se
  -- evalúa sobre el resultado verdadero: aquí es donde la base impide la
  -- sobreventa, y solo cuando realmente lo es.
  update public.inventory_levels
  set on_hand = on_hand + new.quantity_delta,
      updated_at = now()
  where variant_id = new.variant_id
    and location_id = new.location_id;

  return new;
end;
$$;

comment on function private.apply_inventory_movement() is
  'Proyecta el ledger sobre inventory_levels. Dos pasos a propósito: un upsert de un solo paso evaluaría el CHECK sobre la fila propuesta y rechazaría toda venta.';
