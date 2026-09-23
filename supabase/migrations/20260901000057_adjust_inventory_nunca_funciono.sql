-- ============================================================================
-- Lumane · 0057 · `adjust_inventory` nunca había funcionado
-- ============================================================================
-- Al llamarla por primera vez desde la pantalla de inventario:
--
--     42804: column "type" is of type public.inventory_movement_type
--            but expression is of type text
--
-- El `case ... then 'initial' else 'adjustment' end` resuelve a `text`, y la
-- columna es un enum. Postgres no convierte solo el resultado de un `case`
-- aunque sí lo haría con un literal suelto, así que la función se escribió,
-- se concedió a `authenticated` en la 0018, y nunca se ejecutó — ni una vez
-- desde la Fase 0.
--
-- Es la MISMA trampa que apareció en la 0041 con `outbox_mark_failed`. Es el
-- segundo caso, así que conviene decirlo en alto: en este esquema, un `case`
-- que devuelve valores de enum necesita su cast explícito. Sin él, el error
-- no aparece al crear la función, sino la primera vez que alguien la usa.
--
-- `apply_stock_count` delega en esta función, así que el conteo físico entero
-- estaba roto por debajo sin que se supiera.
-- ============================================================================

create or replace function public.adjust_inventory(
  p_variant_id  uuid,
  p_new_quantity integer,
  p_reason      text,
  p_location_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_location uuid;
  v_current  integer;
  v_delta    integer;
begin
  if not private.has_permission('inventory.adjust') then
    raise exception 'No tienes permiso para ajustar inventario'
      using errcode = 'insufficient_privilege';
  end if;

  if p_new_quantity < 0 then
    raise exception 'Las existencias no pueden ser negativas' using errcode = 'check_violation';
  end if;

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Un ajuste necesita un motivo' using errcode = 'check_violation';
  end if;

  v_location := coalesce(p_location_id, private.current_location_id());

  select on_hand into v_current
  from public.inventory_levels
  where variant_id = p_variant_id and location_id = v_location
  for update;

  v_delta := p_new_quantity - coalesce(v_current, 0);

  if v_delta = 0 then
    return jsonb_build_object('changed', false, 'on_hand', p_new_quantity);
  end if;

  insert into public.inventory_movements
    (variant_id, location_id, type, quantity_delta, reference_type, note, created_by)
  values (p_variant_id, v_location,
          -- El cast es lo que faltaba. Se mantiene la distinción entre la
          -- carga inicial de una variante y un ajuste posterior: no es
          -- cosmética, es lo que permite separar «así empezó» de «esto se
          -- corrigió» al revisar el historial de una pieza.
          (case
             when coalesce(v_current, 0) = 0 and v_delta > 0 then 'initial'
             else 'adjustment'
           end)::public.inventory_movement_type,
          v_delta, 'adjustment', btrim(p_reason), (select auth.uid()));

  return jsonb_build_object(
    'changed', true,
    'delta', v_delta,
    'on_hand', (select on_hand from public.inventory_levels
                where variant_id = p_variant_id and location_id = v_location)
  );
end;
$$;

comment on function public.adjust_inventory(uuid, integer, text, uuid) is
  'Fija las existencias de una variante escribiendo la diferencia como movimiento. Nunca sobrescribe el nivel.';

revoke execute on function public.adjust_inventory(uuid, integer, text, uuid) from public, anon;
grant  execute on function public.adjust_inventory(uuid, integer, text, uuid) to authenticated;
