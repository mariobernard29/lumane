-- ============================================================================
-- Lumane · 0042 · El latido que vacía el outbox
-- ============================================================================
-- La Edge Function `enviar-correos` sabe mandar, pero no se llama sola. Aquí
-- se la invoca cada minuto desde pg_cron, igual que la 0028 hace con el
-- barrido de reservas.
--
-- Cada minuto y no cada cinco porque una confirmación de compra que tarda
-- cinco minutos en llegar ya generó la duda que venía a evitar. El coste es
-- despreciable: si no hay nada pendiente, `outbox_claim` devuelve cero filas y
-- la función responde en milisegundos.
--
-- La llave NO va escrita aquí. `cron.job` guarda el comando en claro y lo
-- puede leer cualquiera con acceso a la base, así que un `Bearer eyJ...` en el
-- texto del trabajo sería la llave maestra a la vista. Se lee de Vault en
-- tiempo de ejecución.
--
-- Hay que reconocer el intercambio: guardar la `service_role` en Vault la
-- pone, cifrada, dentro de la misma base que protege. Se acepta porque la
-- alternativa —un worker externo con la llave en su propio entorno— añade una
-- pieza más que mantener, y porque quien pudiera descifrar Vault ya tiene la
-- base entera de todos modos.
-- ============================================================================

create extension if not exists pg_net;

create or replace function private.despachar_correos()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  select s.decrypted_secret into v_key
  from vault.decrypted_secrets s
  where s.name = 'service_role_key'
  limit 1;

  -- Avisar y salir, no reventar: un cron que falla cada minuto llena el log de
  -- ruido idéntico y entierra los errores que sí importan.
  if v_key is null or btrim(v_key) = '' then
    raise warning '[correos] falta el secreto «service_role_key» en Vault; no se despacha nada';
    return;
  end if;

  perform net.http_post(
    url     := 'https://izyoixhffjjodzizkbqk.supabase.co/functions/v1/enviar-correos',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || v_key,
                 'Content-Type',  'application/json'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end;
$$;

comment on function private.despachar_correos() is
  'Invoca la Edge Function que vacía el outbox. Llamada por pg_cron cada minuto.';

revoke execute on function private.despachar_correos() from public, anon, authenticated;

-- `cron.schedule` sobre un nombre existente lo reemplaza, así que reaplicar la
-- migración no deja dos trabajos compitiendo por la misma cola.
select cron.schedule(
  'lumane-enviar-correos',
  '* * * * *',
  $$select private.despachar_correos()$$
);
