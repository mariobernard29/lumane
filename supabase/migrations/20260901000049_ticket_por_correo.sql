-- ============================================================================
-- Lumane · 0049 · El ticket de la venta, por correo
-- ============================================================================
-- La boutique no tiene impresora todavía y puede que tarde. Mientras tanto el
-- ticket va por correo, reutilizando el outbox y el cron que ya funcionan: la
-- alternativa —montar el transporte Bluetooth a ciegas, sin un aparato con el
-- que probar— es construir algo que no se puede verificar.
--
-- Tres cosas aquí, y la primera es un ERROR EN PRODUCCIÓN.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Una venta de mostrador no es un pedido en línea
--
-- `pos_create_sale` inserta la venta con `status = 'completed'` (0017:136). El
-- trigger de bitácora escribe entonces un evento con `from_status = null`, y
-- `emit_order_event` decidía el topic SOLO por eso: si no hay estado anterior,
-- es un pedido nuevo. Resultado: una venta de mostrador con clienta asociada
-- recibía «Recibimos tu pedido y ya lo estamos preparando» por una prenda que
-- se llevó puesta en la mano.
--
-- Hoy no ha ocurrido porque ninguna venta de mostrador lleva clienta. Pero el
-- ticket por correo existe justamente para asociarla, así que sin esto el
-- primer ticket vendría acompañado de un correo absurdo.
--
-- Se mira el canal, no el estado: un pedido en línea siempre nace en `placed`
-- y una venta de mostrador en `completed`, pero el canal lo dice sin depender
-- de esa coincidencia.
-- ---------------------------------------------------------------------------
create or replace function private.emit_order_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_channel public.order_channel;
begin
  -- Los borradores (carrito del POS en curso) no notifican a nadie.
  if new.to_status = 'draft' then
    return new;
  end if;

  select o.channel into v_channel from public.orders o where o.id = new.order_id;

  -- El nacimiento de una venta de mostrador no avisa: quien compró ya se fue
  -- con su prenda. Su ticket se manda a petición, con `pos_send_receipt`.
  if v_channel = 'pos' and new.from_status is null then
    return new;
  end if;

  perform private.emit_event(
    case when new.from_status is null then 'order.placed' else 'order.status_changed' end,
    jsonb_build_object(
      'order_id',    new.order_id,
      'from_status', new.from_status,
      'to_status',   new.to_status,
      'occurred_at', new.created_at
    )
  );
  return new;
end;
$$;

comment on function private.emit_order_event() is
  'Emite el evento de correo de un cambio de estado. El alta de una venta de mostrador no avisa.';

-- ---------------------------------------------------------------------------
-- 2. El contenido del ticket
--
-- Se AMPLÍA `order_email_payload` en vez de escribir un `sale_receipt_payload`
-- aparte. Dos constructores del mismo JSON acaban discrepando, que es el mismo
-- argumento que la 0041 usó para no recalcular los importes en JavaScript.
--
-- Todo lo añadido es aditivo: las plantillas que ya funcionan siguen leyendo
-- las mismas claves.
-- ---------------------------------------------------------------------------
create or replace function public.order_email_payload(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order', jsonb_build_object(
      'id',              o.id,
      'number',          o.order_number,
      'status',          o.status,
      'payment_status',  o.payment_status,
      'channel',         o.channel,
      'placed_at',       o.placed_at,
      'currency',        o.currency,
      'subtotal_cents',  o.subtotal_cents,
      'discount_cents',  o.discount_cents,
      'shipping_cents',  o.shipping_cents,
      'tax_cents',       o.tax_cents,
      'total_cents',     o.total_cents,
      'shipping_address', o.shipping_address,
      'shipping_method', o.shipping_method_snapshot,
      'note',            o.note
    ),
    'customer', (
      select jsonb_build_object(
        'first_name', c.first_name,
        'last_name',  c.last_name,
        'email',      c.email::text
      )
      from public.customers c
      where c.id = o.customer_id
    ),
    'lines', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'product_name',     l.product_name,
            'variant_title',    l.variant_title,
            'sku',              l.sku,
            'quantity',         l.quantity,
            'unit_price_cents', l.unit_price_cents,
            'total_cents',      l.total_cents
          ) order by l.position
        ),
        '[]'::jsonb
      )
      from public.order_lines l
      where l.order_id = o.id
    ),
    -- NUEVO: con qué se pagó. Un ticket sin la forma de pago no sirve para
    -- cuadrar nada, y es lo primero que se mira al reclamar.
    'payments', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'method',         p.method,
            'amount_cents',   p.amount_cents,
            'tendered_cents', p.tendered_cents,
            'change_cents',   p.change_cents,
            'reference',      p.reference
          ) order by p.created_at
        ),
        '[]'::jsonb
      )
      from public.payments p
      where p.order_id = o.id and p.amount_cents > 0
    ),
    'change_cents', (select coalesce(sum(p.change_cents), 0)
                     from public.payments p where p.order_id = o.id),
    'shipment', (
      select jsonb_build_object(
        'carrier',         s.carrier,
        'tracking_number', s.tracking_number,
        'tracking_url',    s.tracking_url,
        'shipped_at',      s.shipped_at
      )
      from public.shipments s
      where s.order_id = o.id
      order by s.created_at desc
      limit 1
    ),
    -- NUEVO: dónde se hizo la venta y quién la cobró. En un mostrador con
    -- turnos, un ticket sin nombre no se puede reclamar a nadie.
    'location', (
      select jsonb_build_object('name', l.name, 'code', l.code,
                                'address', l.address, 'phone', l.phone)
      from public.locations l where l.id = o.location_id
    ),
    'cashier', (
      select jsonb_build_object('full_name', pr.full_name)
      from public.profiles pr where pr.id = o.created_by
    ),
    'store', (
      select jsonb_build_object(
        'name',          st.store_name,
        'contact_email', st.contact_email,
        'contact_phone', st.contact_phone,
        'whatsapp',      st.whatsapp_number,
        'hours',         st.opening_hours,
        'copyright',     st.copyright_text
      )
      from public.store_settings st
      limit 1
    )
  )
  from public.orders o
  where o.id = p_order_id;
$$;

comment on function public.order_email_payload(uuid) is
  'Todo lo que una plantilla de correo necesita de un pedido o una venta, en una llamada.';

revoke execute on function public.order_email_payload(uuid) from public, anon, authenticated;
grant  execute on function public.order_email_payload(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Mandarlo
--
-- Se pide DESPUÉS de cobrar, nunca antes: meter un campo de correo en el
-- camino crítico de todas las ventas, para servir a la minoría que lo quiere,
-- costaría los quince segundos por venta que el plan persigue.
--
-- Emite el evento en lugar de mandar el correo, para que la venta no dependa
-- de que Resend esté en pie — la misma razón por la que existe el outbox.
--
-- No lleva `client_uuid`: reenviar un ticket a propósito es legítimo (la
-- clienta lo borró, se equivocó de correo), y un duplicado accidental cuesta un
-- correo, no dinero. Es exactamente lo contrario que una venta.
-- ---------------------------------------------------------------------------
create or replace function public.pos_send_receipt(
  p_order_id uuid,
  p_email    text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order   public.orders%rowtype;
  v_destino text := lower(nullif(btrim(coalesce(p_email, '')), ''));
begin
  if not private.has_permission('orders.read') then
    raise exception 'No tienes permiso para mandar tickets' using errcode = 'insufficient_privilege';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Esa venta no existe' using errcode = 'no_data_found';
  end if;

  if v_order.channel <> 'pos' then
    raise exception 'Los pedidos en línea ya reciben su confirmación por correo'
      using errcode = 'check_violation';
  end if;

  -- Si no viene correo en la llamada, se usa el de la clienta asociada.
  if v_destino is null and v_order.customer_id is not null then
    select lower(c.email::text) into v_destino
    from public.customers c where c.id = v_order.customer_id;
  end if;

  if v_destino is null then
    raise exception 'Este ticket no tiene a dónde ir: escribe un correo'
      using errcode = 'no_data_found';
  end if;

  -- Si la venta tiene clienta y ella no tenía correo, se le guarda: la segunda
  -- visita ya no lo pide. No se sobrescribe uno existente —cambiar el correo
  -- de una clienta es una decisión suya, no un efecto colateral de un ticket—
  -- ni se pisa el de otra ficha, que el índice único parcial rechazaría.
  if v_order.customer_id is not null then
    update public.customers c
    set email = v_destino
    where c.id = v_order.customer_id
      and c.email is null
      and not exists (
        select 1 from public.customers otra
        where otra.email = v_destino::extensions.citext
          and otra.archived_at is null
      );
  end if;

  perform private.emit_event(
    'sale.receipt',
    jsonb_build_object(
      'order_id',     v_order.id,
      'email',        v_destino,
      'requested_by', (select auth.uid())
    )
  );

  return jsonb_build_object('queued', true, 'email', v_destino);
end;
$$;

comment on function public.pos_send_receipt(uuid, text) is
  'Encola el ticket de una venta de mostrador. Sirve también para reenviarlo desde el historial.';

revoke execute on function public.pos_send_receipt(uuid, text) from public, anon;
grant  execute on function public.pos_send_receipt(uuid, text) to authenticated;
