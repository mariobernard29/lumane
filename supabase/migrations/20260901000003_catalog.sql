-- ============================================================================
-- Lumane · 0003 · Catálogo
-- ============================================================================
-- Modelo de variantes genérico (opciones N-dimensionales), no una tabla con
-- columnas fijas "talla" y "color": añadir "largo" o "material" mañana no
-- toca el esquema.
--
--   products ──< product_options ──< product_option_values
--            └─< product_variants ──< variant_option_values >─┘
--
-- Búsqueda: tsvector generado + GIN sobre productos (nombre, marca, resumen)
-- y trigram sobre SKU. El código de barras se busca por índice único directo.
-- ============================================================================

-- unaccent inmutable: requisito para usarlo en columnas generadas e índices.
create or replace function private.f_unaccent(text)
returns text
language sql
immutable
parallel safe
as $$ select extensions.unaccent('extensions.unaccent'::regdictionary, $1) $$;

-- ---------------------------------------------------------------------------
-- Categorías (jerárquicas) y colecciones (curaduría editorial)
-- ---------------------------------------------------------------------------

create table public.categories (
  id              uuid primary key default private.uuid_generate_v7(),
  parent_id       uuid references public.categories (id) on delete set null,
  name            text not null,
  slug            text not null unique,
  description     text,
  image_path      text,
  position        integer not null default 0,
  is_visible      boolean not null default true,
  seo_title       text,
  seo_description text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index categories_parent_id_idx on public.categories (parent_id);
create index categories_visible_position_idx on public.categories (position) where is_visible;

create table public.collections (
  id              uuid primary key default private.uuid_generate_v7(),
  name            text not null,
  slug            text not null unique,
  description     text,
  -- Imagen de la card en /colecciones; banner del encabezado de la landing.
  image_path      text,
  banner_path     text,
  badge_label     text,
  position        integer not null default 0,
  -- Publicar una colección en el sitio es exactamente esto: is_visible = true.
  is_visible      boolean not null default false,
  seo_title       text,
  seo_description text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index collections_visible_position_idx on public.collections (position) where is_visible;

-- ---------------------------------------------------------------------------
-- Productos
-- ---------------------------------------------------------------------------

create type public.product_status as enum ('draft', 'active', 'archived');

create table public.products (
  id                  uuid primary key default private.uuid_generate_v7(),
  name                text not null,
  slug                text not null unique,
  short_description   text,
  long_description    text,
  brand               text,
  status              public.product_status not null default 'draft',
  -- Visible en la tienda en línea. Un producto puede existir solo para el POS.
  is_online           boolean not null default true,
  primary_category_id uuid references public.categories (id) on delete set null,
  seo_title           text,
  seo_description     text,
  published_at        timestamptz,
  archived_at         timestamptz,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  search_vector       tsvector generated always as (
    to_tsvector('spanish',
      coalesce(private.f_unaccent(name), '') || ' ' ||
      coalesce(private.f_unaccent(brand), '') || ' ' ||
      coalesce(private.f_unaccent(short_description), '')
    )
  ) stored
);

create index products_search_vector_idx on public.products using gin (search_vector);
create index products_name_trgm_idx on public.products using gin (name extensions.gin_trgm_ops);
create index products_primary_category_id_idx on public.products (primary_category_id);
create index products_created_by_idx on public.products (created_by);
-- Índice parcial: el storefront SIEMPRE filtra por estos dos predicados.
create index products_storefront_idx on public.products (published_at desc)
  where status = 'active' and is_online;

-- Opciones de variante: "Talla", "Color", ...
create table public.product_options (
  id         uuid primary key default private.uuid_generate_v7(),
  product_id uuid not null references public.products (id) on delete cascade,
  name       text not null,
  position   integer not null default 0,
  unique (product_id, name)
);
create index product_options_product_id_idx on public.product_options (product_id);

create table public.product_option_values (
  id        uuid primary key default private.uuid_generate_v7(),
  option_id uuid not null references public.product_options (id) on delete cascade,
  value     text not null,
  -- Hex del swatch cuando la opción es un color (ver ColorSwatch del prototipo).
  hex       text,
  position  integer not null default 0,
  unique (option_id, value)
);
create index product_option_values_option_id_idx on public.product_option_values (option_id);

-- ---------------------------------------------------------------------------
-- Variantes: la unidad real de venta e inventario
-- ---------------------------------------------------------------------------

create table public.product_variants (
  id                     uuid primary key default private.uuid_generate_v7(),
  product_id             uuid not null references public.products (id) on delete cascade,
  -- "M / Ônix" — se materializa al guardar para poder snapshotearlo en ventas.
  title                  text not null default '',
  sku                    text not null unique,
  barcode                text unique,
  -- Dinero en centavos. El precio YA INCLUYE IVA.
  price_cents            bigint not null check (price_cents >= 0),
  compare_at_price_cents bigint check (compare_at_price_cents >= 0),
  cost_cents             bigint not null default 0 check (cost_cents >= 0),
  weight_grams           integer check (weight_grams >= 0),
  -- Ubicación física dentro de la boutique (percha, cajón, bodega).
  bin_location           text,
  low_stock_threshold    integer not null default 2 check (low_stock_threshold >= 0),
  position               integer not null default 0,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- Un precio rebajado exige un precio anterior mayor: la card de /rebajas
  -- depende de esta invariante para calcular el porcentaje.
  constraint variant_compare_price_is_higher
    check (compare_at_price_cents is null or compare_at_price_cents > price_cents)
);

create index product_variants_product_id_idx on public.product_variants (product_id);
create index product_variants_sku_trgm_idx on public.product_variants using gin (sku extensions.gin_trgm_ops);
-- Piezas en rebaja: el índice parcial sirve directo a /rebajas.
create index product_variants_on_sale_idx on public.product_variants (product_id)
  where compare_at_price_cents is not null and is_active;

create table public.variant_option_values (
  variant_id      uuid not null references public.product_variants (id) on delete cascade,
  option_value_id uuid not null references public.product_option_values (id) on delete cascade,
  primary key (variant_id, option_value_id)
);
create index variant_option_values_option_value_id_idx
  on public.variant_option_values (option_value_id);

-- ---------------------------------------------------------------------------
-- Imágenes, taxonomías y relaciones
-- ---------------------------------------------------------------------------

create table public.product_images (
  id           uuid primary key default private.uuid_generate_v7(),
  product_id   uuid not null references public.products (id) on delete cascade,
  -- Si apunta a una variante, es la foto de ese color/talla en concreto.
  variant_id   uuid references public.product_variants (id) on delete set null,
  -- Ruta en Storage (products/{product_id}/{uuid}.webp), NO la URL: el bucket
  -- puede cambiar sin reescribir la base.
  storage_path text not null,
  alt_text     text not null default '',
  width        integer,
  height       integer,
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);
create index product_images_product_id_position_idx on public.product_images (product_id, position);
create index product_images_variant_id_idx on public.product_images (variant_id);

create table public.product_categories (
  product_id  uuid not null references public.products (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  primary key (product_id, category_id)
);
create index product_categories_category_id_idx on public.product_categories (category_id);

create table public.product_collections (
  product_id    uuid not null references public.products (id) on delete cascade,
  collection_id uuid not null references public.collections (id) on delete cascade,
  position      integer not null default 0,
  primary key (product_id, collection_id)
);
create index product_collections_collection_id_position_idx
  on public.product_collections (collection_id, position);

create table public.tags (
  id   uuid primary key default private.uuid_generate_v7(),
  name text not null,
  slug text not null unique
);

create table public.product_tags (
  product_id uuid not null references public.products (id) on delete cascade,
  tag_id     uuid not null references public.tags (id) on delete cascade,
  primary key (product_id, tag_id)
);
create index product_tags_tag_id_idx on public.product_tags (tag_id);

create table public.product_relations (
  product_id         uuid not null references public.products (id) on delete cascade,
  related_product_id uuid not null references public.products (id) on delete cascade,
  position           integer not null default 0,
  primary key (product_id, related_product_id),
  constraint product_relation_not_self check (product_id <> related_product_id)
);
create index product_relations_related_product_id_idx
  on public.product_relations (related_product_id);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create trigger categories_set_updated_at before update on public.categories
  for each row execute function private.set_updated_at();
create trigger collections_set_updated_at before update on public.collections
  for each row execute function private.set_updated_at();
create trigger products_set_updated_at before update on public.products
  for each row execute function private.set_updated_at();
create trigger product_variants_set_updated_at before update on public.product_variants
  for each row execute function private.set_updated_at();
