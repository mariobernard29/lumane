-- ============================================================================
-- Lumane · 0009 · CMS de la tienda en línea
-- ============================================================================
-- Requisito explícito: "No quiero imágenes o textos escritos directamente en el
-- código. Todo debe venir desde el administrador."
--
-- Por eso también el menú de 12 categorías y las 5 columnas del footer son
-- filas: en el prototipo estaban repetidos a mano en las 8 páginas HTML.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Hero y banners
-- ---------------------------------------------------------------------------

create table public.hero_slides (
  id                uuid primary key default private.uuid_generate_v7(),
  -- Página donde vive el carrusel: 'home', 'colecciones', 'rebajas'...
  page_key          text not null,
  image_path        text not null,
  mobile_image_path text,
  image_alt         text not null default '',
  eyebrow           text,
  title             text,
  subtitle          text,
  cta_label         text,
  cta_href          text,
  secondary_cta_label text,
  secondary_cta_href  text,
  position          integer not null default 0,
  is_active         boolean not null default true,
  -- Programación: un hero de temporada puede publicarse y retirarse solo.
  starts_at         timestamptz,
  ends_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index hero_slides_page_position_idx on public.hero_slides (page_key, position)
  where is_active;

create table public.banners (
  id          uuid primary key default private.uuid_generate_v7(),
  -- Ranura donde se pinta: 'rebajas_hero', 'catalogo_mosaico', 'curaduria'...
  slot_key    text not null,
  image_path  text,
  image_alt   text not null default '',
  eyebrow     text,
  title       text,
  subtitle    text,
  cta_label   text,
  cta_href    text,
  position    integer not null default 0,
  is_active   boolean not null default true,
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index banners_slot_position_idx on public.banners (slot_key, position) where is_active;

-- Secciones componibles de home y landing pages. `config` guarda los
-- parámetros propios de cada tipo (cuántos productos, qué colección, etc.).
create table public.page_sections (
  id         uuid primary key default private.uuid_generate_v7(),
  page_key   text not null,
  type       text not null,
  -- El "01 / Comprar" del prototipo.
  eyebrow    text,
  title      text,
  subtitle   text,
  config     jsonb not null default '{}'::jsonb,
  position   integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index page_sections_page_position_idx on public.page_sections (page_key, position)
  where is_active;

-- ---------------------------------------------------------------------------
-- Páginas de contenido: políticas, FAQ, guía de tallas, contacto...
-- ---------------------------------------------------------------------------

create table public.pages (
  id              uuid primary key default private.uuid_generate_v7(),
  slug            text not null unique,
  title           text not null,
  excerpt         text,
  body            text,
  seo_title       text,
  seo_description text,
  is_published    boolean not null default false,
  position        integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index pages_published_idx on public.pages (slug) where is_published;

create table public.faqs (
  id         uuid primary key default private.uuid_generate_v7(),
  category   text,
  question   text not null,
  answer     text not null,
  position   integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index faqs_visible_position_idx on public.faqs (position) where is_visible;

-- ---------------------------------------------------------------------------
-- Navegación
-- ---------------------------------------------------------------------------

create table public.navigation_menus (
  id         uuid primary key default private.uuid_generate_v7(),
  key        text not null unique,
  name       text not null,
  created_at timestamptz not null default now()
);

create table public.navigation_items (
  id         uuid primary key default private.uuid_generate_v7(),
  menu_id    uuid not null references public.navigation_menus (id) on delete cascade,
  parent_id  uuid references public.navigation_items (id) on delete cascade,
  label      text not null,
  href       text not null,
  -- El prototipo pinta "Rebajas" siempre en negrita.
  is_emphasized boolean not null default false,
  position   integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index navigation_items_menu_position_idx on public.navigation_items (menu_id, position)
  where is_visible;
create index navigation_items_parent_id_idx on public.navigation_items (parent_id);

-- ---------------------------------------------------------------------------
-- Ajustes globales (fila única)
-- ---------------------------------------------------------------------------

create table public.store_settings (
  -- Truco de singleton: solo puede existir la fila `true`.
  id                 boolean primary key default true check (id),
  store_name         text not null default 'LUMANE',
  tagline            text,
  contact_email      text,
  contact_phone      text,
  whatsapp_number    text,
  opening_hours      text,
  social_links       jsonb not null default '{}'::jsonb,
  -- Tasa de IVA vigente. Los precios YA la incluyen; se usa para desglosar.
  tax_rate           numeric(5,4) not null default 0.16 check (tax_rate >= 0 and tax_rate < 1),
  currency           text not null default 'MXN',
  -- Envío gratis a partir de este subtotal (null = nunca).
  free_shipping_over_cents bigint check (free_shipping_over_cents >= 0),
  -- Minutos que dura una reserva de inventario durante el checkout.
  reservation_minutes integer not null default 20 check (reservation_minutes > 0),
  newsletter_title   text,
  newsletter_body    text,
  newsletter_disclaimer text,
  copyright_text     text,
  updated_at         timestamptz not null default now()
);

create trigger hero_slides_set_updated_at before update on public.hero_slides
  for each row execute function private.set_updated_at();
create trigger banners_set_updated_at before update on public.banners
  for each row execute function private.set_updated_at();
create trigger page_sections_set_updated_at before update on public.page_sections
  for each row execute function private.set_updated_at();
create trigger pages_set_updated_at before update on public.pages
  for each row execute function private.set_updated_at();
create trigger faqs_set_updated_at before update on public.faqs
  for each row execute function private.set_updated_at();
create trigger navigation_items_set_updated_at before update on public.navigation_items
  for each row execute function private.set_updated_at();
create trigger store_settings_set_updated_at before update on public.store_settings
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Semilla: los ajustes y la navegación tal como están en el prototipo.
-- ---------------------------------------------------------------------------

insert into public.store_settings (
  id, store_name, tagline, contact_email, whatsapp_number, opening_hours,
  newsletter_title, newsletter_body, newsletter_disclaimer, copyright_text
) values (
  true,
  'LUMANE',
  'Boutique de moda femenina. Piezas de autor, en series cortas.',
  'hola@lumane.mx',
  null,
  'Lun a sáb · 10:00 – 19:00',
  'Antes que nadie.',
  'Novedades, colecciones y acceso anticipado a las rebajas.',
  'Al suscribirte aceptas recibir correos de LUMANE. Puedes darte de baja cuando quieras.',
  '© 2026 LUMANE. Todos los derechos reservados.'
);

insert into public.navigation_menus (key, name) values
  ('header',        'Navegación principal'),
  ('footer_tienda', 'Footer · Tienda'),
  ('footer_ayuda',  'Footer · Ayuda'),
  ('footer_casa',   'Footer · La casa'),
  ('footer_legal',  'Footer · Legal');

-- Las 12 entradas del nav superior. Las 9 categorías apuntan a su landing
-- propia (el prototipo las mandaba todas al mismo catálogo).
insert into public.navigation_items (menu_id, label, href, position, is_emphasized)
select m.id, i.label, i.href, i.position, i.is_emphasized
from public.navigation_menus m
cross join (values
  ('Vestidos',            '/catalogo/vestidos',            1,  false),
  ('Sets',                '/catalogo/sets',                2,  false),
  ('Pantalones',          '/catalogo/pantalones',          3,  false),
  ('Suéters / cardigans', '/catalogo/sueters-cardigans',   4,  false),
  ('Abrigos',             '/catalogo/abrigos',             5,  false),
  ('Tops / bodies',       '/catalogo/tops-bodies',         6,  false),
  ('Camisas',             '/catalogo/camisas',             7,  false),
  ('Shorts y bermudas',   '/catalogo/shorts-bermudas',     8,  false),
  ('Bolsos',              '/catalogo/bolsos',              9,  false),
  ('Colecciones',         '/colecciones',                  10, false),
  ('Editorial',           '/p/nuestra-historia',           11, false),
  ('Rebajas',             '/rebajas',                      12, true)
) as i(label, href, position, is_emphasized)
where m.key = 'header';

insert into public.navigation_items (menu_id, label, href, position)
select m.id, i.label, i.href, i.position
from public.navigation_menus m
cross join (values
  ('Novedades',   '/catalogo?orden=novedades', 1),
  ('Colecciones', '/colecciones',              2),
  ('Rebajas',     '/rebajas',                  3),
  ('Todo el catálogo', '/catalogo',            4)
) as i(label, href, position)
where m.key = 'footer_tienda';

insert into public.navigation_items (menu_id, label, href, position)
select m.id, i.label, i.href, i.position
from public.navigation_menus m
cross join (values
  ('Mi cuenta',              '/cuenta',                     1),
  ('Buscar',                 '/buscar',                     2),
  ('Contacto',               '/p/contacto',                 3),
  ('Envíos y devoluciones',  '/p/envios-y-devoluciones',    4),
  ('Guía de tallas',         '/p/guia-de-tallas',           5),
  ('Preguntas frecuentes',   '/p/preguntas-frecuentes',     6)
) as i(label, href, position)
where m.key = 'footer_ayuda';

insert into public.navigation_items (menu_id, label, href, position)
select m.id, i.label, i.href, i.position
from public.navigation_menus m
cross join (values
  ('Nuestra historia',      '/p/nuestra-historia',      1),
  ('Sostenibilidad',        '/p/sostenibilidad',        2),
  ('Puntos de venta',       '/p/puntos-de-venta',       3),
  ('Trabaja con nosotros',  '/p/trabaja-con-nosotros',  4)
) as i(label, href, position)
where m.key = 'footer_casa';

insert into public.navigation_items (menu_id, label, href, position)
select m.id, i.label, i.href, i.position
from public.navigation_menus m
cross join (values
  ('Privacidad', '/p/privacidad', 1),
  ('Términos',   '/p/terminos',   2),
  ('Cookies',    '/p/cookies',    3)
) as i(label, href, position)
where m.key = 'footer_legal';

-- Marcadores de página: se crean vacíos y publicados en false para que el nav
-- nunca apunte a un 404, y se redactan desde el administrador.
insert into public.pages (slug, title, position) values
  ('nuestra-historia',     'Nuestra historia',     1),
  ('contacto',             'Contacto',             2),
  ('envios-y-devoluciones','Envíos y devoluciones',3),
  ('guia-de-tallas',       'Guía de tallas',       4),
  ('preguntas-frecuentes', 'Preguntas frecuentes', 5),
  ('sostenibilidad',       'Sostenibilidad',       6),
  ('puntos-de-venta',      'Puntos de venta',      7),
  ('trabaja-con-nosotros', 'Trabaja con nosotros', 8),
  ('privacidad',           'Aviso de privacidad',  9),
  ('terminos',             'Términos y condiciones', 10),
  ('cookies',              'Política de cookies',  11);
