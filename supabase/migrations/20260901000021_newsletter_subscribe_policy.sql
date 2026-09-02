-- ============================================================================
-- Lumane · 0021 · Alta pública en el boletín
-- ============================================================================
-- La migración de RLS solo dio LECTURA al personal sobre
-- `newsletter_subscribers`. Sin una política de INSERT, el formulario del pie
-- fallaba en silencio para cualquier visitante: la Server Action se ejecutaba,
-- RLS descartaba la fila y nadie se enteraba.
--
-- Se concede INSERT, y solo INSERT. Quien se suscribe no puede leer la lista
-- ni comprobar si un correo ya está dado de alta: eso convertiría el
-- formulario en una forma de averiguar quién es clienta de Lumane.
-- ============================================================================

create policy newsletter_public_subscribe on public.newsletter_subscribers
  for insert to anon, authenticated
  with check (true);

comment on table public.newsletter_subscribers is
  'Suscripciones al boletín. Alta pública (solo INSERT); la lectura es exclusiva del personal.';
