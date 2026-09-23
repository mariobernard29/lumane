-- ============================================================================
-- Lumane · 0043 · pg_net sale del esquema public
-- ============================================================================
-- La 0042 creó la extensión sin decir dónde y fue a parar a `public`, que es
-- el esquema que PostgREST expone. El linter de Supabase lo marca con razón:
-- todo lo que viva ahí queda a un nombre de distancia de la API pública.
--
-- pg_net no es reubicable, así que `alter extension ... set schema` no vale;
-- hay que recrearla. No hay riesgo: lo único que la usa es
-- `private.despachar_correos()`, que resuelve `net.http_post` por nombre al
-- ejecutarse. El esquema `net` lo crea el script de la propia extensión y no
-- depende de dónde quede registrada, así que la función sigue encontrándola.
--
-- Se corrige aquí en lugar de editar la 0042 por la misma razón de siempre:
-- una migración aplicada es historia. Una base recreada desde cero pasa por
-- las dos y termina igual que la que está en producción.
-- ============================================================================

drop extension if exists pg_net;
create extension pg_net with schema extensions;
