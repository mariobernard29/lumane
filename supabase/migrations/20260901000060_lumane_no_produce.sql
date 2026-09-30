-- ============================================================================
-- Lumane · 0060 · Lumane no produce: es una boutique que elige
-- ============================================================================
-- El contenido sembrado desde la Fase 1 daba por hecho una marca que fabrica.
-- No es el caso: Lumane compra a proveedores y vende en su tienda. Varias
-- frases del sitio afirmaban lo contrario, y eso no es un matiz de estilo —
-- «producimos en tiradas cortas» es una afirmación sobre el negocio que
-- cualquiera puede comprobar y que no se sostiene.
--
-- ---------------------------------------------------------------------------
-- Cómo se reescribe, y qué se evita decir
-- ---------------------------------------------------------------------------
-- Hay dos maneras de arreglarlo y solo una sirve.
--
-- La mala es sustituir «lo fabricamos» por «lo compramos y lo reetiquetamos».
-- Es cierto, pero ningún comercio del mundo describe así su trabajo, y dicho
-- en la portada suena a disculpa por algo que no tiene nada de malo.
--
-- La buena es contar lo que la boutique SÍ hace y que es su verdadero valor:
-- **elegir**. Decidir qué entra a la tienda, traer pocas piezas de cada
-- modelo, poder probárselas, y que alguien te atienda. Todo eso es verdad, es
-- comprobable y es lo que distingue a una boutique de un catálogo en línea.
--
-- Por eso el vocabulario nuevo gira sobre «elegimos», «traemos» y «buscamos»,
-- y nunca sobre «producimos», «confeccionamos» ni «nuestro taller».
--
-- ---------------------------------------------------------------------------
-- Las cuatro páginas que se van
-- ---------------------------------------------------------------------------
-- `nuestra-historia`, `sostenibilidad`, `puntos-de-venta` y
-- `trabaja-con-nosotros`. Dos de ellas eran justamente las que hablaban de un
-- taller; las cuatro prometían una empresa que hoy no existe.
--
-- Se BORRAN, no se ocultan. Una página despublicada que afirma cosas falsas
-- sigue ahí para que alguien la reactive por error, y su contenido tendría que
-- reescribirse entero de todas formas.
--
-- Lo que sí se rescata es lo cierto de `puntos-de-venta` —horario, recogida de
-- pedidos, que es la única tienda— y pasa a la página nueva.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · La dirección de verdad
-- ---------------------------------------------------------------------------
-- `locations.address` es de donde ya lee la plantilla de contacto, así que es
-- el único sitio donde debe escribirse. La página nueva lee la misma fila: una
-- boutique con dos direcciones distintas en dos páginas es un problema que se
-- descubre cuando llega una clienta a la esquina equivocada.

update public.locations
set address = jsonb_build_object(
      'street',       'Blvd. Canuto Ibarra Guerrero',
      'ext_no',       '1606',
      'int_no',       'Local 3',
      'neighborhood', 'Jardines del Sol',
      'postal_code',  '81245',
      'city',         'Los Mochis',
      'state',        'Sinaloa',
      'country',      'MX',
      'references',   'Casi esquina con Álvaro Obregón'
    )
where code = 'MOCHIS';

-- ---------------------------------------------------------------------------
-- 2 · La portada dejaba de ser cierta en su bloque principal
-- ---------------------------------------------------------------------------
-- Decía «producir poco y producir bien» y «cada pieza se trabaja en tiradas
-- cortas». El bloque se queda donde está —es el cierre editorial de la
-- portada— pero contando lo que de verdad pasa.

update public.page_sections
set title = 'Pocas piezas, bien elegidas',
    subtitle = 'Lumane es una boutique en Los Mochis. Cada temporada elegimos a mano lo que entra a la tienda: '
               || 'pocas piezas de cada modelo, telas que aguantan el uso y cortes que se siguen poniendo la '
               || 'temporada siguiente. Lo que no nos pondríamos, no lo vendemos.',
    -- El CTA apuntaba a `nuestra-historia`, que desaparece en esta misma
    -- migración. Sin esto, el botón más visible de la portada daría un 404.
    config = config
             || jsonb_build_object('cta_href', '/p/la-boutique', 'cta_label', 'Conocer la boutique')
where page_key = 'home' and type = 'about_split';

-- ---------------------------------------------------------------------------
-- 3 · Las preguntas frecuentes
-- ---------------------------------------------------------------------------

update public.faqs
set answer = 'Que trajimos muy pocas piezas de ese modelo y no las volveremos a pedir. '
             || 'Cuando se agota una talla, no regresa.'
where question ilike '%edición limitada%';

update public.faqs
set answer = 'Depende. Las de edición limitada no vuelven. De las demás a veces conseguimos más; '
             || 'escríbenos y te avisamos si entra de nuevo.'
where question ilike '%volver a tener una pieza agotada%';

-- ---------------------------------------------------------------------------
-- 4 · La ficha de producto que lo repetía
-- ---------------------------------------------------------------------------

update public.products
set short_description = 'Edición limitada',
    long_description  = 'Blusa de escote corazón y falda corta en crudo con estampado de lunares negros. '
                        || 'Trajimos muy pocas piezas de este modelo y no las volveremos a pedir.'
where slug = (select slug from public.products where name ilike '%Serie Lunares%' limit 1);

-- ---------------------------------------------------------------------------
-- 5 · La página de la boutique
-- ---------------------------------------------------------------------------
-- Plantilla nueva `store`, porque lo que hay que enseñar —dirección, mapa y
-- fotos del local— no es prosa. El cuerpo sigue siendo Markdown editable, pero
-- la dirección NO se escribe ahí: la pinta el renderizador desde `locations`.
--
-- Las fotos viven en `hero_slides` con `page_key = 'boutique'`. Es la tabla que
-- ya existe para imágenes con pie de foto, y reutilizarla significa que la
-- galería se administra desde el panel sin inventar una tabla nueva. Hoy no hay
-- ninguna: la propietaria las subirá, y hasta entonces la galería no se pinta.

alter table public.pages drop constraint if exists pages_template_is_known;

alter table public.pages
  add constraint pages_template_is_known
  check (template in ('prose', 'faq', 'contact', 'store'));

comment on column public.pages.template is
  'Cómo se pinta la página: prose (Markdown), faq (acordeón), contact (datos de contacto), store (la boutique).';

insert into public.pages (slug, title, excerpt, body, template, is_published, position, seo_title, seo_description)
values (
  'la-boutique',
  'La boutique',
  'Nuestra única tienda, en Jardines del Sol, Los Mochis.',
  E'Estamos sobre el Blvd. Canuto Ibarra Guerrero, casi esquina con Álvaro Obregón, en Jardines del Sol.\n\n'
  || E'Es la única tienda Lumane. Ahí está todo el catálogo, puedes probarte las piezas antes de decidir y '
  || E'una asesora te ayuda con las tallas.\n\n'
  || E'## Recoger un pedido en línea\n\n'
  || E'No cuesta nada. Haz tu pedido en la tienda en línea, elige recoger en boutique y espera nuestro correo '
  || E'de «listo para recoger». Trae una identificación cuando vengas.\n\n'
  || E'## ¿Hay tienda en otra ciudad?\n\n'
  || E'No, es la única. Pero enviamos a todo México con guía rastreable, y dentro de Los Mochis hacemos '
  || E'entrega a domicilio el mismo día o al siguiente.',
  'store',
  true,
  3,
  'La boutique Lumane en Los Mochis',
  'Visítanos en Blvd. Canuto Ibarra Guerrero 1606, local 3, Jardines del Sol, Los Mochis. Todo el catálogo, pruébate antes de comprar y recoge tus pedidos en línea sin costo.'
)
on conflict (slug) do update
  set title = excluded.title,
      excerpt = excluded.excerpt,
      body = excluded.body,
      template = excluded.template,
      is_published = true,
      seo_title = excluded.seo_title,
      seo_description = excluded.seo_description;

-- ---------------------------------------------------------------------------
-- 6 · Fuera las cuatro páginas y sus enlaces
-- ---------------------------------------------------------------------------
-- Los enlaces PRIMERO. Al revés quedaría, aunque fuera un instante, un menú
-- apuntando a páginas que ya no existen.

delete from public.navigation_items
where href in (
  '/p/nuestra-historia',
  '/p/sostenibilidad',
  '/p/puntos-de-venta',
  '/p/trabaja-con-nosotros'
);

delete from public.pages
where slug in ('nuestra-historia', 'sostenibilidad', 'puntos-de-venta', 'trabaja-con-nosotros');

-- ---------------------------------------------------------------------------
-- 7 · Recomponer la navegación
-- ---------------------------------------------------------------------------
-- `footer_casa` se quedó sin un solo enlace: sus cuatro eran las cuatro
-- borradas. Una columna vacía en el pie se ve como un error de programación,
-- así que recibe la página nueva.

insert into public.navigation_items (menu_id, label, href, position, is_visible)
select m.id, 'La boutique', '/p/la-boutique', 1, true
from public.navigation_menus m
where m.key = 'footer_casa'
  and not exists (
    select 1 from public.navigation_items i
    where i.menu_id = m.id and i.href = '/p/la-boutique'
  );

-- En la cabecera había un «Editorial» que llevaba a la historia inventada. El
-- `delete` de arriba ya se lo llevó —filtra por destino, y ese era su
-- destino—, así que aquí se repone el hueco apuntando a la página que sí
-- existe. Va en la posición 11, donde estaba, entre «Colecciones» y
-- «Rebajas»: la barra se lee de categorías a marca a ofertas, y meterlo al
-- final rompería ese orden.
insert into public.navigation_items (menu_id, label, href, position, is_visible)
select m.id, 'La boutique', '/p/la-boutique', 11, true
from public.navigation_menus m
where m.key = 'header'
  and not exists (
    select 1 from public.navigation_items i
    where i.menu_id = m.id and i.href = '/p/la-boutique'
  );

-- ---------------------------------------------------------------------------
-- 8 · La colección que se me escapó en la primera pasada
-- ---------------------------------------------------------------------------
-- «Una cápsula de autor en tiraje corto. Cuando se agota, no vuelve a
-- producirse.» Se pinta en la portada, en el bloque de colecciones.
--
-- No apareció en la primera búsqueda porque busqué «taller», «artesan» y
-- «confecc» en `collections`, pero no «tiraje». La lección para la próxima vez
-- que se audite el contenido: el vocabulario de fabricación es más ancho de lo
-- que parece —tirada, tiraje, cápsula de autor, serie numerada— y conviene
-- barrer TODAS las tablas de texto con TODOS los términos a la vez, en una
-- sola consulta, en vez de tabla por tabla.
update public.collections
set description = 'Una selección muy corta: de estas piezas trajimos contadas unidades. '
                  || 'Cuando se agota, no vuelve.'
where slug = 'serie-lunares';
