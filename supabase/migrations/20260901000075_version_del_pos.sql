-- ============================================================================
-- Lumane · 0075 · La versión vigente del POS
-- ============================================================================
-- Las actualizaciones por aire (`eas update`) llevan JavaScript; la tablet las
-- detecta sola y pide reiniciar. Pero un cambio NATIVO —un permiso, la
-- orientación, el Bluetooth— exige instalar un APK nuevo, y la tablet no tiene
-- forma de enterarse de que existe.
--
-- Esta fila se lo dice: la versión del APK vigente y de dónde bajarlo. Si la
-- tablet corre una versión menor, enseña un aviso con el botón de descarga.
-- Se actualiza a mano (o desde el script de publicación) después de cada
-- `eas build`.
--
-- Una sola fila (`id = true`), como `store_settings`. Solo la lee el personal:
-- el enlace del APK no tiene por qué estar a la vista de cualquiera.
-- ============================================================================

create table public.pos_release (
  id           boolean primary key default true check (id),
  version      text not null,
  apk_url      text not null,
  notas        text,
  published_at timestamptz not null default now()
);

comment on table public.pos_release is
  'La versión vigente del APK del POS y su enlace de descarga. Una sola fila; la tablet avisa si la suya es menor.';

alter table public.pos_release enable row level security;

create policy pos_release_staff_read on public.pos_release
  for select to authenticated
  using ((select private.is_staff()));

grant select on public.pos_release to authenticated;
