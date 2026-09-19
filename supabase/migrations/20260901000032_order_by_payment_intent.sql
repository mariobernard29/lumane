-- ============================================================================
-- Lumane · 0032 · Buscar el pedido por su PaymentIntent
-- ============================================================================
-- Tras pagar con tarjeta, Stripe devuelve a la clienta a nuestro sitio con el
-- id del PaymentIntent en la URL. El pedido, en cambio, lo crea el WEBHOOK, y
-- ese aviso puede llegar uno o dos segundos después.
--
-- La pantalla de espera necesita poder preguntar "¿ya existe mi pedido?" sin
-- poder crearlo: cerrar el pedido desde el navegador sería fiarse de quien
-- compra. Esta función solo LEE, y solo devuelve el folio y el token.
--
-- ¿Es seguro que sea pública? El id de un PaymentIntent es una cadena
-- aleatoria larga que solo conoce quien inició ese pago concreto, y lo que se
-- devuelve es lo mismo que esa persona ya recibe por correo. No expone importes,
-- ni direcciones, ni ningún otro pedido.
-- ============================================================================

create or replace function public.get_order_by_payment_intent(
  p_provider_payment_id text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order_number', o.order_number,
    'guest_token',  o.guest_token
  )
  from public.orders o
  join public.payments pay on pay.order_id = o.id
  where p_provider_payment_id is not null
    and pay.provider_payment_id = p_provider_payment_id
    and o.status <> 'draft'
  limit 1;
$$;

comment on function public.get_order_by_payment_intent(text) is
  'Folio y token de un pedido a partir del id de su PaymentIntent. Solo lectura: la pantalla de espera pregunta, no confirma.';

revoke execute on function public.get_order_by_payment_intent(text) from public;
grant execute on function public.get_order_by_payment_intent(text) to anon, authenticated;
