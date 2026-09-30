-- ============================================================================
-- Lumane · 0062 · Los dos últimos restos de «marca que fabrica»
-- ============================================================================
-- La 0060 barrió el contenido con un vocabulario de fabricación amplio, y la
-- 0061 añadió «tiraje» y «cápsula de autor» tras encontrarlos en la portada.
-- Faltaban dos, y aparecieron mirando el sitio renderizado, no la base:
--
--   1. `store_settings.tagline` — «Piezas de autor, en series cortas». Sale en
--      el PIE DE TODAS LAS PÁGINAS, que es probablemente el texto más visto
--      del sitio entero.
--   2. `pages.terminos` — «Trabajamos con series cortas». En una página legal,
--      que es donde peor sienta una afirmación que no se sostiene.
--
-- ---------------------------------------------------------------------------
-- Por qué se escaparon tres veces
-- ---------------------------------------------------------------------------
-- Porque cada pasada buscó los términos que se le ocurrieron a quien la
-- escribió. «Taller» y «confeccionar» son obvios; «de autor» y «series
-- cortas» no suenan a fabricación hasta que los lees en el pie de la página.
--
-- La lección práctica, ya con tres repeticiones detrás: **auditar contenido
-- leyendo el sitio renderizado, no consultando la base**. Las tres veces el
-- resto se encontró abriendo una página, nunca con un `ilike`. La consulta
-- sirve para confirmar que no queda nada más una vez sabes qué buscar.
-- ============================================================================

update public.store_settings
set tagline = 'Boutique de moda femenina. Pocas piezas de cada modelo, elegidas a mano.'
where id;

update public.pages
set body = replace(
      body,
      'Trabajamos con series cortas y el inventario es real:',
      'Traemos pocas piezas de cada modelo y el inventario es real:'
    )
where slug = 'terminos';
