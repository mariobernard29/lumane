-- ============================================================================
-- Lumane · 0044 · Queda constancia de qué envío fue cada evento
-- ============================================================================
-- La 0041 guardaba el motivo cuando algo fallaba y tiraba el identificador que
-- devuelve Resend cuando salía bien. Eso deja cojo el único caso en que de
-- verdad hace falta: la clienta dice «no me llegó nada» y hay que averiguar si
-- el correo salió, a qué dirección y qué pasó después.
--
-- Sin el identificador, buscar ese envío en el panel de Resend es adivinar por
-- fecha y asunto entre todos los de ese día. Con él es una búsqueda directa
-- que dice si rebotó, si lo abrieron o si se quedó en la cola del destinatario.
--
-- Columna aparte y no reaprovechar `last_error`: son dos cosas distintas y
-- mezclarlas obligaría a leer una cadena para saber si dice un error o una
-- referencia. Un evento omitido —una venta de mostrador sin clienta— seguirá
-- teniendo motivo en `last_error` y `provider_ref` en null, que es justo la
-- diferencia que queremos poder ver de un vistazo.
-- ============================================================================

alter table public.outbox_events
  add column if not exists provider_ref text;

comment on column public.outbox_events.provider_ref is
  'Identificador del envío en el proveedor (Resend). Null si no se mandó nada.';

-- Buscar «de qué evento salió este correo» cuando llega un rebote con solo el
-- identificador de Resend a mano.
create index if not exists outbox_events_provider_ref_idx
  on public.outbox_events (provider_ref)
  where provider_ref is not null;

-- Hay que tirar la versión de un argumento antes de crear la de dos: con un
-- valor por omisión, las dos aceptarían una llamada de un solo argumento y
-- Postgres rechazaría esa llamada por ambigua.
drop function if exists public.outbox_mark_sent(uuid);

create or replace function public.outbox_mark_sent(
  p_id          uuid,
  p_provider_ref text default null
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.outbox_events
  set status       = 'sent',
      processed_at = now(),
      last_error   = null,
      provider_ref = p_provider_ref
  where id = p_id;
$$;

comment on function public.outbox_mark_sent(uuid, text) is
  'Cierra un evento como enviado y guarda la referencia del proveedor.';

revoke execute on function public.outbox_mark_sent(uuid, text) from public, anon, authenticated;
grant  execute on function public.outbox_mark_sent(uuid, text) to service_role;
