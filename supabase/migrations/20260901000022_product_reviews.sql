-- ============================================================================
-- Lumane · 0022 · Reseñas de producto
-- ============================================================================
-- La ficha del prototipo dedica una sección entera a las reseñas: nota media
-- gigante, barras de distribución por estrellas y el sello "Compra verificada".
-- Sin una tabla que las sostenga, esa parte de la página sería contenido
-- inventado en el código —justo lo que el proyecto viene a eliminar.
--
-- `is_verified` no lo escribe quien reseña: lo deriva la existencia de un
-- pedido suyo con esa pieza. Un sello de confianza que cualquiera pudiera
-- marcar por su cuenta no valdría nada.
-- ============================================================================

create table public.product_reviews (
  id           uuid primary key default private.uuid_generate_v7(),
  product_id   uuid not null references public.products (id) on delete cascade,
  customer_id  uuid references public.customers (id) on delete set null,
  -- Pedido que respalda la compra. Si existe, la reseña es verificada.
  order_id     uuid references public.orders (id) on delete set null,
  author_name  text not null,
  rating       smallint not null check (rating between 1 and 5),
  title        text,
  body         text not null,
  -- Las reseñas se publican tras revisión: una boutique pequeña no puede
  -- permitirse que un mensaje ofensivo aparezca solo en su ficha de producto.
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index product_reviews_product_published_idx
  on public.product_reviews (product_id, created_at desc)
  where is_published;
create index product_reviews_customer_id_idx on public.product_reviews (customer_id);
create index product_reviews_order_id_idx on public.product_reviews (order_id);

create trigger product_reviews_set_updated_at before update on public.product_reviews
  for each row execute function private.set_updated_at();

alter table public.product_reviews enable row level security;

create policy product_reviews_public_read on public.product_reviews
  for select to anon, authenticated using (is_published);

create policy product_reviews_own_read on public.product_reviews
  for select to authenticated
  using (customer_id = (select private.current_customer_id()));

-- Una clienta puede escribir su reseña, pero nace sin publicar y no puede
-- publicarse a sí misma: el WITH CHECK impide que `is_published` llegue en true.
create policy product_reviews_own_insert on public.product_reviews
  for insert to authenticated
  with check (
    customer_id = (select private.current_customer_id())
    and is_published = false
  );

create policy product_reviews_staff_all on public.product_reviews
  for all to authenticated
  using ((select private.has_permission('cms.read')))
  with check ((select private.has_permission('cms.write')));

-- ---------------------------------------------------------------------------
-- Resumen por producto: nota media y distribución por estrellas.
-- La ficha lo necesita en cada carga; calcularlo en la consulta de la página
-- obligaría a traerse todas las reseñas solo para promediarlas.
-- ---------------------------------------------------------------------------
create view public.v_product_ratings
with (security_invoker = true)
as
select
  r.product_id,
  count(*)::integer                              as reviews_count,
  round(avg(r.rating)::numeric, 1)               as average_rating,
  count(*) filter (where r.rating = 5)::integer  as five_star,
  count(*) filter (where r.rating = 4)::integer  as four_star,
  count(*) filter (where r.rating = 3)::integer  as three_star,
  count(*) filter (where r.rating = 2)::integer  as two_star,
  count(*) filter (where r.rating = 1)::integer  as one_star
from public.product_reviews r
where r.is_published
group by r.product_id;
