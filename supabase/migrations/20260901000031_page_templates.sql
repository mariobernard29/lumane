-- ============================================================================
-- Lumane · 0031 · Plantillas de página
-- ============================================================================
-- Las páginas de contenido no son todas iguales: las preguntas frecuentes son
-- un acordeón alimentado por su propia tabla, contacto muestra los datos de la
-- boutique, y la guía de tallas es una tabla de medidas. El resto es prosa.
--
-- La plantilla se guarda en una COLUMNA, no se deduce del slug. Si mañana la
-- boutique renombra `preguntas-frecuentes` a `dudas`, el acordeón tiene que
-- seguir ahí: el slug es parte de la URL y la boutique puede cambiarlo, la
-- plantilla es una decisión de diseño.
--
-- El cuerpo se escribe en MARKDOWN. Es lo que se puede teclear sin pelearse en
-- la tablet del POS, y al renderizarse en el servidor no hay forma de que un
-- `<script>` llegue al navegador de una clienta.
-- ============================================================================

alter table public.pages
  add column if not exists template text not null default 'prose';

alter table public.pages
  drop constraint if exists pages_template_is_known;

alter table public.pages
  add constraint pages_template_is_known
  check (template in ('prose', 'faq', 'contact', 'size_guide'));

comment on column public.pages.template is
  'Cómo se pinta la página: prose (Markdown), faq (acordeón desde `faqs`), contact (datos de la boutique) o size_guide.';

comment on column public.pages.body is
  'Markdown. Se renderiza en el servidor y se sanea antes de enviarse al navegador.';

update public.pages set template = 'faq'        where slug = 'preguntas-frecuentes';
update public.pages set template = 'contact'    where slug = 'contacto';
update public.pages set template = 'size_guide' where slug = 'guia-de-tallas';
