-- ============================================================================
-- Lumane · 0019 · Cierre de permisos sobre los RPC
-- ============================================================================
-- Postgres concede EXECUTE a PUBLIC en toda función nueva. Un simple
-- `grant execute ... to authenticated` NO quita esa concesión: las funciones
-- del POS quedaban expuestas en /rest/v1/rpc/... también para `anon`.
--
-- En la práctica ya eran seguras (cada una llama a private.has_permission(),
-- que para un anónimo devuelve false y aborta), pero eso es UNA sola capa. Una
-- función nueva a la que se le olvide la comprobación quedaría abierta.
-- Aquí se cierra la puerta de entrada, no solo la interior.
--
-- Se documenta también qué funciones son públicas A PROPÓSITO y por qué.
-- ============================================================================

do $$
declare sig text;
begin
  -- Funciones exclusivas del personal: fuera de la API anónima.
  foreach sig in array array[
    'public.pos_create_sale(jsonb)',
    'public.pos_create_return(jsonb)',
    'public.get_pos_sale(uuid)',
    'public.open_register(bigint, uuid)',
    'public.close_register(bigint, uuid, text)',
    'public.add_cash_movement(public.cash_direction, bigint, text)',
    'public.get_register_summary(uuid)',
    'public.adjust_inventory(uuid, integer, text, uuid)',
    'public.apply_stock_count(jsonb, uuid, text)',
    'public.receive_stock(uuid, integer, bigint, text, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', sig);
    execute format('grant execute on function %s to authenticated', sig);
  end loop;

  -- Carrito y checkout: accesibles sin sesión A PROPÓSITO. La tienda debe
  -- funcionar para una invitada. La autorización no es el rol, es el `token`
  -- secreto del carrito (24 bytes aleatorios en cookie httpOnly): quien lo
  -- tiene es su dueña. Sin token no se puede alcanzar ningún carrito ajeno.
  foreach sig in array array[
    'public.get_cart(text)',
    'public.add_cart_line(text, uuid, integer)',
    'public.set_cart_line_quantity(text, uuid, integer)',
    'public.preview_checkout(text, text, text, integer)',
    'public.reserve_cart_stock(text)',
    -- Solo responde por el código exacto que la clienta ya escribió; la tabla
    -- `coupons` sigue siendo ilegible, así que no se pueden enumerar.
    'public.validate_coupon(text, jsonb, public.order_channel)',
    -- Requiere número de pedido MÁS su guest_token firmado.
    'public.get_order_by_token(text, text)'
  ] loop
    execute format('revoke execute on function %s from public', sig);
    execute format('grant execute on function %s to anon, authenticated', sig);
  end loop;

  -- merge_cart necesita sesión por definición.
  revoke execute on function public.merge_cart(text) from public, anon;
  grant execute on function public.merge_cart(text) to authenticated;
end $$;

-- Estas dos jamás salen del servidor: las llaman el webhook de Stripe y
-- pg_cron, ambos con service_role.
revoke execute on function public.confirm_online_order(
  text, text, text, text, text, jsonb, text, jsonb, integer, text, text, boolean
) from public, anon, authenticated;
revoke execute on function public.release_expired_reservations() from public, anon, authenticated;
revoke execute on function public.release_cart_reservations(uuid) from public, anon, authenticated;
