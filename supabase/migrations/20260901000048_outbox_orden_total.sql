-- ============================================================================
-- Lumane · 0048 · Los correos salen en el orden en que ocurrieron
-- ============================================================================
-- `outbox_claim` ordenaba por `next_attempt_at` a secas. Ese valor sale de
-- `now()`, que en Postgres es el instante de la TRANSACCIÓN, no el de la fila:
-- todo lo escrito dentro de una misma transacción comparte timestamp al
-- microsegundo. Comprobado: tres inserciones con `pg_sleep` entre ellas
-- devuelven un único `created_at` distinto.
--
-- Con empates, el orden del lote queda a merced del plan de ejecución. Dos
-- eventos del mismo pedido emitidos en una transacción podrían mandarse
-- invertidos, y la clienta recibiría «tu pedido va en camino» antes que
-- «estamos preparando tu pedido». Un correo desordenado no se puede recoger.
--
-- El desempate es `id`, que es uuid **v7**: lleva el tiempo en los bits altos y
-- es monótono dentro de la transacción, así que ordena por causalidad sin
-- columna nueva ni secuencia. Es la razón por la que la 0001 eligió v7 en vez
-- de v4 para las claves.
-- ============================================================================

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
    order by e.next_attempt_at, e.id
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
  'Reclama un lote de eventos pendientes, en orden causal. Solo el worker.';

revoke execute on function public.outbox_claim(integer) from public, anon, authenticated;
grant  execute on function public.outbox_claim(integer) to service_role;
