-- ============================================================================
-- Lumane · 0054 · `size_guide` deja de ser una plantilla que no existe
-- ============================================================================
-- La migración 0031 permitió cuatro plantillas de página: `prose`, `faq`,
-- `contact` y `size_guide`. Las tres primeras tienen su rama en
-- `(storefront)/p/[slug]/page.tsx`. La cuarta no: cae al mismo `else` que
-- `prose` y se pinta exactamente igual.
--
-- La tentación era escribirle un renderizador. Al mirar qué haría distinto, la
-- respuesta es NADA: lo único que diferencia a una guía de tallas es su tabla
-- ancha, y `globals.css` ya la resuelve desde la Fase 1 —con scroll propio en
-- móvil para que el cuerpo de la página no se desplace en horizontal—, en unas
-- reglas cuyo comentario menciona «las tablas de tarifas y de TALLAS».
--
-- Un valor que la base admite y que no cambia nada es peor que no tenerlo: le
-- promete a quien lo elija un comportamiento que no va a ocurrir, y a quien
-- lea el esquema le hace buscar un renderizador que no existe. Se quita.
--
-- Si algún día la guía de tallas merece algo propio —una calculadora de talla,
-- por ejemplo— se vuelve a añadir junto con el código que lo pinta, no antes.
-- ============================================================================

update public.pages set template = 'prose' where template = 'size_guide';

alter table public.pages drop constraint if exists pages_template_is_known;

alter table public.pages
  add constraint pages_template_is_known
  check (template in ('prose', 'faq', 'contact'));

comment on column public.pages.template is
  'Cómo se pinta la página. Cada valor tiene su rama en p/[slug]: prose (Markdown), faq (acordeón desde la tabla faqs) y contact (Markdown a dos columnas con la ficha de la boutique).';
