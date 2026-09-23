-- ============================================================================
-- Lumane · 0045 · La máquina de estados de un pedido
-- ============================================================================
-- `order_status` define ocho estados desde la migración 0007, pero nada impide
-- saltar de uno a otro. Hoy no se nota porque NINGÚN camino del esquema
-- actualiza `orders.status`: los tres que existen —`confirm_online_order`,
-- `pos_create_sale` y el de pago pendiente— nacen con su estado puesto en el
-- `insert`. La bandeja de pedidos del POS es el primer escritor de verdad, y
-- sin esto podría mandar a una clienta «tu pedido fue entregado» sin haberle
-- mandado nunca «va en camino».
--
-- POR QUÉ UN TRIGGER Y NO UN RPC. La RLS ya autoriza el UPDATE a quien tenga
-- `orders.fulfill`, y los triggers de la 0007 y la 0010 ya escriben la bitácora
-- y emiten el correo. Un RPC sería una tercera capa que repite eso y hay que
-- mantener sincronizada — y protegería solo a quien lo llama. Un trigger
-- protege a TODOS los escritores: el POS, el panel de administración que
-- viene, y a quien abra un `psql` a las tres de la mañana.
--
-- Va en `before`, no en `after`, para que la bitácora nunca llegue a registrar
-- una transición que se va a rechazar.
-- ============================================================================

create or replace function private.transicion_valida(
  p_desde public.order_status,
  p_hacia public.order_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_desde
    -- El carrito del mostrador todavía no es una venta.
    when 'draft'     then p_hacia in ('placed', 'cancelled')
    -- Recién pagado: o se empieza a preparar, o se cancela y se reintegra.
    when 'placed'    then p_hacia in ('preparing', 'cancelled')
    when 'preparing' then p_hacia in ('packed', 'cancelled')
    when 'packed'    then p_hacia in ('shipped', 'cancelled')
    -- Una vez que el paquete salió, echarse atrás es una DEVOLUCIÓN, no una
    -- cancelación: hay mercancía en la calle y dinero que reintegrar por otra
    -- vía. Para eso está `pos_create_return`, que además reintegra inventario
    -- y deja un pago negativo para que el corte de caja cuadre.
    when 'shipped'   then p_hacia in ('delivered')
    -- `completed` es contable, no de cara a la clienta: para ella el final es
    -- «entregado». Se marca cuando el pedido deja de poder devolverse.
    when 'delivered' then p_hacia in ('completed')
    -- `completed` y `cancelled` son terminales. Una venta de mostrador nace
    -- ya en `completed`, así que este `else` también la protege de que algo
    -- la mueva.
    else false
  end;
$$;

comment on function private.transicion_valida(public.order_status, public.order_status) is
  'Tabla de transiciones legales de un pedido. La autoridad; todo lo demás la refleja.';

create or replace function private.enforce_order_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.transicion_valida(old.status, new.status) then
    return new;
  end if;

  -- El mensaje se enseña tal cual en la tablet: los RPC de este proyecto
  -- vienen redactados en español para el mostrador, no para un registro.
  -- El `hint` es lo que `classifyError` de @lumane/db mira para decidir.
  raise exception 'Un pedido en «%» no puede pasar a «%»', old.status, new.status
    using errcode = 'check_violation',
          hint    = 'transicion_invalida';
end;
$$;

comment on function private.enforce_order_transition() is
  'Rechaza cualquier salto de estado que no esté en private.transicion_valida().';

-- `when` en el propio trigger y no un `if` dentro: así Postgres ni siquiera
-- invoca la función cuando el UPDATE no toca el estado, que es la mayoría.
create trigger orders_enforce_transition
  before update of status on public.orders
  for each row
  when (new.status is distinct from old.status)
  execute function private.enforce_order_transition();
