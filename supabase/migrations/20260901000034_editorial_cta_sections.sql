-- ===========================================================================
-- Bloques editoriales de /colecciones y /buscar
--
-- Las dos páginas terminan en una llamada a la asesora de la boutique. Son el
-- mismo gesto con dos formatos distintos: en colecciones, un bloque alto a dos
-- columnas con fotografías; en buscar, una franja de una línea.
--
-- Van en `page_sections` —la tabla hecha para secciones componibles— y no en
-- el código: el texto de una promesa comercial lo cambia la boutique, no un
-- despliegue. Apagar `is_active` retira el bloque sin dejar hueco.
--
-- `config.ctaHref` puede quedar vacío: en ese caso el botón lleva al WhatsApp
-- de `store_settings`, que es donde ya vive el número. Duplicarlo aquí sería
-- garantizar que algún día dejen de coincidir.
-- ===========================================================================

insert into public.page_sections (page_key, type, eyebrow, title, subtitle, config, position, is_active)
values
  (
    'colecciones',
    'editorial_cta',
    'Curaduría personal',
    '¿No sabes por dónde empezar?',
    'Escríbenos por WhatsApp y armamos contigo una colección a tu medida: tu talla, tus colores favoritos y la ocasión que tengas en mente. Sin costo, sin compromiso.',
    jsonb_build_object(
      'ctaLabel', 'Hablar con una asesora',
      'ctaIcon', 'chat',
      'images', jsonb_build_array(
        jsonb_build_object(
          'path', '/prototipo/65b7f1862abb439e9b1529b369edf803.webp',
          'alt',  'Conjunto de blazer y short en rosa pastel con botones dorados.'
        ),
        jsonb_build_object(
          'path', '/prototipo/deeb2f5c2ea44c0e8f61de52dfce5e72.webp',
          'alt',  'Dos bolsos de piel con tachuelas, uno negro y otro gris, sobre bases doradas.'
        )
      )
    ),
    1,
    true
  ),
  (
    'buscar',
    'help_cta',
    null,
    '¿No encontraste lo que buscabas?',
    'Escríbenos por WhatsApp y una asesora te ayuda a encontrar la pieza exacta.',
    jsonb_build_object(
      'ctaLabel', 'Escribir por WhatsApp',
      'ctaIcon', 'chat'
    ),
    1,
    true
  )
on conflict do nothing;
