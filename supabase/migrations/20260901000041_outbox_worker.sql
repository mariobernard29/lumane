-- ============================================================================
-- Lumane · 0041 · El consumidor del outbox
-- ============================================================================
-- La 0010 dejó la tabla `outbox_events` y el trigger que la llena, pero nadie
-- la vaciaba. Aquí van las tres piezas que faltaban, todas en Postgres:
-- reclamar un lote, marcar el resultado, y armar el contenido del correo.
--
-- La Edge Function que manda por Resend no decide nada: pide trabajo, manda
-- bytes y reporta. Toda la lógica —a quién se escribe, con qué datos, cuándo
-- se reintenta— vive aquí, donde se puede probar con SQL y donde no depende
-- de que un despliegue de Deno esté sano. Es la ADR 0001 aplicada al correo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Reclamo de lote
--
-- `for update skip locked` es lo que permite que dos workers corran a la vez
-- sin mandar el mismo correo dos veces: el segundo salta las filas que el
-- primero ya tiene bloqueadas en lugar de esperarlas.
--
-- Se reclaman también las filas en `processing` cuya hora ya pasó. Eso cubre
-- el caso feo: el worker murió a mitad —se quedó sin tiempo, se cayó el
-- despliegue— y dejó el evento marcado como en curso para siempre. Al ponerle
-- `next_attempt_at` diez minutos por delante al reclamarlo, una fila atascada
-- vuelve sola a la cola sin necesidad de un barrendero aparte.
--
-- El precio de esa decisión es que un correo podría salir dos veces si el
-- envío sí ocurrió pero el worker murió antes de marcarlo. Se prefiere eso a
-- perderlo: una confirmación de compra duplicada molesta; una que no llega
-- hace que la clienta crea que su pedido no existe.
-- ---------------------------------------------------------------------------
create or replace function public.outbox_claim(p_limit integer default 10)
returns setof public.outbox_events
language sql
volatile
security definer
set search_path = ''
as $$
  with listos as (
    select e.id
    from public.outbox_events e
    where e.status in ('pending', 'processing')
      and e.next_attempt_at <= now()
    order by e.next_attempt_at
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  update public.outbox_events e
  set status          = 'processing',
      attempts        = e.attempts + 1,
      next_attempt_at = now() + interval '10 minutes'
  from listos
  where e.id = listos.id
  returning e.*;
$$;

comment on function public.outbox_claim(integer) is
  'Reclama un lote de eventos pendientes y los marca en curso. Solo el worker.';

-- ---------------------------------------------------------------------------
-- 2. Resultado del intento
-- ---------------------------------------------------------------------------
create or replace function public.outbox_mark_sent(p_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.outbox_events
  set status = 'sent', processed_at = now(), last_error = null
  where id = p_id;
$$;

comment on function public.outbox_mark_sent(uuid) is
  'Cierra un evento del outbox como enviado.';

-- Backoff exponencial en base 4, contado desde el intento que acaba de fallar:
-- 1 min, 4, 16, 64, 256, y a partir de ahí se abandona. Una hora larga de
-- reintentos cubre una caída pasajera de Resend sin convertir un fallo
-- permanente —una dirección que no existe— en ruido infinito.
create or replace function public.outbox_mark_failed(
  p_id           uuid,
  p_error        text,
  p_max_attempts integer default 5
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.outbox_events e
  -- El cast es obligatorio: un `case` resuelve a text y la columna es un enum.
  set status = (case when e.attempts >= p_max_attempts then 'failed' else 'pending' end)::public.outbox_status,
      last_error = left(coalesce(p_error, 'error sin detalle'), 2000),
      next_attempt_at = now()
        + (interval '1 minute' * power(4, least(greatest(e.attempts - 1, 0), 4))),
      processed_at = case when e.attempts >= p_max_attempts then now() else null end
  where e.id = p_id;
$$;

comment on function public.outbox_mark_failed(uuid, text, integer) is
  'Devuelve un evento a la cola con espera creciente, o lo abandona tras agotarse.';

-- Un evento que no tiene nada que notificar —una venta de mostrador sin
-- clienta asociada— no es un fallo. Se cierra y no se vuelve a mirar.
create or replace function public.outbox_mark_skipped(p_id uuid, p_reason text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.outbox_events
  set status = 'sent', processed_at = now(),
      last_error = left('omitido: ' || coalesce(p_reason, 'sin motivo'), 2000)
  where id = p_id;
$$;

comment on function public.outbox_mark_skipped(uuid, text) is
  'Cierra un evento que no requería correo, dejando escrito el motivo.';

-- ---------------------------------------------------------------------------
-- 3. El contenido del correo
--
-- Una sola llamada devuelve todo lo que cualquier plantilla puede necesitar.
-- Que lo arme Postgres y no la Edge Function tiene una razón concreta: los
-- importes. Desglosar el IVA o sumar una línea en JavaScript sería una segunda
-- implementación del cálculo, y dos implementaciones del mismo cálculo acaban
-- discrepando. Aquí se leen los valores ya guardados, que son los que se
-- cobraron.
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
  'Todo lo que una plantilla de correo necesita saber de un pedido, en una llamada.';

-- ---------------------------------------------------------------------------
-- 4. Permisos
--
-- Ninguna de estas funciones tiene nada que hacer en un navegador ni en la
-- tablet. `order_email_payload` sobre todo: devuelve el correo y la dirección
-- de la clienta sin pasar por RLS, porque es `security definer`. Si quedara
-- accesible a `authenticated`, cualquiera con sesión podría leer los datos de
-- cualquier pedido con solo adivinar un uuid.
-- ---------------------------------------------------------------------------
revoke execute on function public.outbox_claim(integer)                    from public, anon, authenticated;
revoke execute on function public.outbox_mark_sent(uuid)                   from public, anon, authenticated;
revoke execute on function public.outbox_mark_failed(uuid, text, integer)  from public, anon, authenticated;
revoke execute on function public.outbox_mark_skipped(uuid, text)          from public, anon, authenticated;
revoke execute on function public.order_email_payload(uuid)                from public, anon, authenticated;

grant execute on function public.outbox_claim(integer)                    to service_role;
grant execute on function public.outbox_mark_sent(uuid)                   to service_role;
grant execute on function public.outbox_mark_failed(uuid, text, integer)  to service_role;
grant execute on function public.outbox_mark_skipped(uuid, text)          to service_role;
grant execute on function public.order_email_payload(uuid)                to service_role;
