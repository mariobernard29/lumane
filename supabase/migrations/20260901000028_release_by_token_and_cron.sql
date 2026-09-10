-- ============================================================================
-- Lumane · 0028 · Liberar reservas con el token + barrido programado
-- ============================================================================
-- BUG encontrado probando el checkout: cuando el cierre del pedido falla, el
-- servidor libera la reserva llamando a `release_cart_reservations`, que exige
-- la llave de servicio. Pero si el fallo ES la falta de esa llave, la limpieza
-- falla por lo mismo y la pieza se queda reservada.
--
-- La acción compensatoria no puede depender de más privilegio que la operación
-- que compensa. `reserve_cart_stock` se llama con el token del carrito; su
-- inverso tiene que poder llamarse igual.
--
-- Se añade `release_cart_stock(p_token)`: mismo criterio de autorización que el
-- resto del carrito —quien tiene el token secreto es su dueño— y nada más.
--
-- Y se programa el barrido de caducadas, que es la red de seguridad de todo el
-- diseño de reservas y hasta ahora estaba escrita pero sin programar: si nadie
-- la ejecuta, un checkout abandonado inmoviliza piezas para siempre.
-- ============================================================================

create or replace function public.release_cart_stock(p_token text default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cart_id uuid;
begin
  if p_token is null then
    return 0;
  end if;

  select id into v_cart_id from public.carts where token = p_token;
  if not found then
    -- Un token que no existe no es un error: puede ser un reintento después de
    -- que el carrito se convirtiera en pedido.
    return 0;
  end if;

  return public.release_cart_reservations(v_cart_id);
end;
$$;

comment on function public.release_cart_stock(text) is
  'Libera las reservas de un carrito por su token. Inverso de reserve_cart_stock, con el mismo criterio de autorización.';

revoke execute on function public.release_cart_stock(text) from public;
grant execute on function public.release_cart_stock(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Barrido de reservas caducadas cada 5 minutos.
--
-- Sin esto, toda clienta que llegue al pago y no lo termine deja piezas
-- inmovilizadas de forma indefinida. La ventana de reserva
-- (`store_settings.reservation_minutes`, 20 por omisión) solo significa algo si
-- alguien la hace cumplir.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.schedule(
  'lumane-liberar-reservas-caducadas',
  '*/5 * * * *',
  $$select public.release_expired_reservations()$$
);
