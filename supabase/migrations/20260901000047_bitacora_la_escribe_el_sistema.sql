-- ============================================================================
-- Lumane · 0047 · La bitácora de estados la escribe el sistema, no quien pasa
-- ============================================================================
-- `private.log_order_status_change()` no era `security definer`, así que corría
-- con los permisos de quien hacía el `update`. Y `order_status_events` tiene
-- RLS con una sola política, de LECTURA. Resultado:
--
--     new row violates row-level security policy for table "order_status_events"
--
-- ...ante cualquier `update public.orders set status = ...` hecho por personal.
--
-- Hasta hoy no se notaba porque los dos únicos escritores de estados
-- —`confirm_online_order` y `pos_create_sale`— SON `security definer`, y el
-- trigger heredaba su contexto elevado. La bandeja de pedidos de la 0046 es el
-- primer escritor normal, y se habría estrellado en la tablet.
--
-- POR QUÉ `security definer` Y NO UNA POLÍTICA DE INSERT. Una política dejaría
-- que el personal escribiera filas de bitácora a mano, inventando un historial
-- que nunca ocurrió. Con el trigger elevado, el ÚNICO modo de que aparezca una
-- entrada es que un pedido haya cambiado de estado de verdad. Un registro de
-- auditoría que su propio auditado puede editar no es un registro de auditoría.
--
-- `search_path = ''` ya estaba y se conserva: en una función elevada es lo que
-- impide que alguien con permiso de crear objetos secuestre un nombre sin
-- calificar.
-- ============================================================================

create or replace function private.log_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_events (order_id, from_status, to_status, created_by)
    values (new.id, null, new.status, new.created_by);
  elsif new.status is distinct from old.status then
    insert into public.order_status_events (order_id, from_status, to_status, created_by)
    values (new.id, old.status, new.status, (select auth.uid()));
  end if;
  return new;
end;
$$;

comment on function private.log_order_status_change() is
  'Escribe la bitácora de estados. Elevada a propósito: nadie debe poder redactarla a mano.';
