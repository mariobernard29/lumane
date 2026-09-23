-- ============================================================================
-- Lumane · 0053 · La portada sale de la base
-- ============================================================================
-- `apps/web/src/app/(storefront)/page.tsx` empieza con este comentario:
--
--     «Ni un texto ni una imagen están escritos aquí: todo viene de la base y
--      se administra desde el POS.»
--
-- Y es falso desde la Fase 1. Los cinco encabezados de la portada —«01 /
-- Comprar», «02 / Novedades», «03 / Por tiempo limitado», «04 / Colecciones»,
-- «05 / Nuestra casa»—, sus títulos, sus enlaces y el párrafo entero de
-- «Nuestra casa» están en el JSX. Es la mayor desviación de la regla 2 del
-- proyecto, y justo en la página que la propietaria querría cambiar primero.
--
-- **Los textos de abajo son EXACTAMENTE los que hoy están en el código.** Esta
-- migración tiene que ser invisible: si la portada se ve distinta después de
-- aplicarla, es un error, no una mejora. Comparar con una captura previa es
-- parte de darla por buena.
--
-- Cero DDL: `eyebrow`, `title`, `subtitle`, `config` y `position` ya existen
-- en `page_sections` desde la migración 0009. Solo faltaban las filas y un
-- renderizador que supiera despacharlas.
--
-- Los `type` son nuevos, y el sitio descarta en silencio los que no conoce
-- —así ha sido siempre—, de modo que aplicar esto antes de desplegar el código
-- no rompe nada: la portada simplemente sigue pintando lo que tiene escrito.
-- ============================================================================

insert into public.page_sections (page_key, type, eyebrow, title, subtitle, config, position)
values
  (
    'home', 'category_grid',
    '01 / Comprar',
    'Comprar por categoría',
    null,
    jsonb_build_object(
      'limit', 4,
      'link_label', 'Ver todo el catálogo',
      'link_href', '/catalogo',
      'anchor', 't-categorias'
    ),
    1
  ),
  (
    'home', 'product_grid_new',
    '02 / Novedades',
    'Lo último que llegó',
    null,
    jsonb_build_object(
      'limit', 4,
      'link_label', 'Ver novedades',
      'link_href', '/catalogo?orden=novedades',
      'anchor', 't-novedades',
      -- El escalonado editorial: la 2.ª y la 4.ª tarjeta bajan en escritorio.
      -- Rompe la retícula a propósito, como el prototipo.
      'stagger', true
    ),
    2
  ),
  (
    'home', 'product_grid_sale',
    '03 / Por tiempo limitado',
    'Rebajas',
    null,
    jsonb_build_object(
      'limit', 3,
      'link_label', 'Ver todas las rebajas',
      'link_href', '/rebajas',
      'anchor', 't-rebajas'
    ),
    3
  ),
  (
    'home', 'collection_grid',
    '04 / Colecciones',
    'Elige por temporada u ocasión',
    null,
    jsonb_build_object(
      'limit', 4,
      'link_label', 'Ver colecciones',
      'link_href', '/colecciones',
      'anchor', 't-colecciones'
    ),
    4
  ),
  (
    'home', 'about_split',
    '05 / Nuestra casa',
    'Series cortas, hechas para durar',
    -- El párrafo va en `subtitle`, que es una columna de texto que ya existe,
    -- y no en `config`: así el panel lo edita con el mismo campo que el resto
    -- de secciones, sin un formulario especial para este tipo.
    'Lumane nace en Los Mochis con una idea simple: producir poco y producir bien. Cada pieza se trabaja en tiradas cortas, con telas elegidas a mano y acabados que resisten más de una temporada.',
    jsonb_build_object(
      'cta_label', 'Conocer la casa',
      'cta_href', '/p/nuestra-historia',
      'cta_icon', 'arrow_forward',
      'anchor', 'historia',
      'tone', 'dark'
    ),
    5
  );
