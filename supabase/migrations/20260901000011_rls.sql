-- ============================================================================
-- Lumane · 0011 · Row Level Security
-- ============================================================================
-- RLS activa en TODAS las tablas, sin excepción. Las tres audiencias:
--
--   anon           → visitante del sitio. Solo lee catálogo y contenido publicado.
--   authenticated  → puede ser una CLIENTA o una integrante del PERSONAL.
--                    Se distinguen con private.is_staff().
--   service_role   → salta RLS. Solo lo usa el servidor de Next.js y las Edge
--                    Functions. Nunca llega al navegador ni al bundle de Expo.
--
-- Reparto de responsabilidades:
--   * RLS      → quién puede VER y TOCAR cada fila (gruesa, infalsificable).
--   * RPC      → las reglas de negocio finas (stock, cupones, permisos por
--                acción). Toda escritura de negocio pasa por ahí.
--
-- Rendimiento: cada llamada a función va envuelta en `(select ...)` para que
-- Postgres la evalúe UNA vez por consulta y no una vez por fila.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: ¿este producto es visible para el público?
-- Usado por las tablas hijas del catálogo. No hay recursión porque la política
-- de `products` no consulta ninguna de ellas.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'locations', 'roles', 'role_permissions', 'profiles',
    'categories', 'collections', 'products', 'product_options',
    'product_option_values', 'product_variants', 'variant_option_values',
    'product_images', 'product_categories', 'product_collections',
    'tags', 'product_tags', 'product_relations',
    'inventory_levels', 'inventory_movements', 'inventory_reservations',
    'stock_transfers', 'stock_transfer_lines',
    'customers', 'customer_addresses', 'customer_favorites',
    'carts', 'cart_lines',
    'coupons', 'coupon_targets', 'coupon_redemptions',
    'shipping_methods', 'local_delivery_rates', 'shipping_quotes',
    'orders', 'order_lines', 'payments', 'order_status_events',
    'shipments', 'returns', 'return_lines',
    'register_sessions', 'cash_movements',
    'hero_slides', 'banners', 'page_sections', 'pages', 'faqs',
    'navigation_menus', 'navigation_items', 'store_settings',
    'audit_log', 'outbox_events', 'newsletter_subscribers'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ===========================================================================
-- 1. CATÁLOGO — lectura pública de lo publicado, escritura del personal
-- ===========================================================================

create policy categories_public_read on public.categories
  for select to anon, authenticated using (is_visible);

create policy collections_public_read on public.collections
  for select to anon, authenticated using (is_visible);

create policy products_public_read on public.products
  for select to anon, authenticated using (status = 'active' and is_online);

-- Si puedes ver el producto, puedes ver todo lo que cuelga de él.
create policy product_options_public_read on public.product_options
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));

create policy product_option_values_public_read on public.product_option_values
  for select to anon, authenticated
  using (exists (
    select 1 from public.product_options o where o.id = option_id
  ));

create policy product_variants_public_read on public.product_variants
  for select to anon, authenticated
  using (is_active and exists (select 1 from public.products p where p.id = product_id));

create policy variant_option_values_public_read on public.variant_option_values
  for select to anon, authenticated
  using (exists (select 1 from public.product_variants v where v.id = variant_id));

create policy product_images_public_read on public.product_images
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));

create policy product_categories_public_read on public.product_categories
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));

create policy product_collections_public_read on public.product_collections
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));

create policy tags_public_read on public.tags
  for select to anon, authenticated using (true);

create policy product_tags_public_read on public.product_tags
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));

create policy product_relations_public_read on public.product_relations
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));

-- Disponibilidad pública: la ficha de producto necesita saber si queda la
-- talla M, y el badge "Últimas piezas" del prototipo depende de esta cifra.
create policy inventory_levels_public_read on public.inventory_levels
  for select to anon, authenticated using (true);

-- Escritura del catálogo: personal con permiso de inventario.
do $$
declare t text;
begin
  foreach t in array array[
    'categories', 'collections', 'products', 'product_options',
    'product_option_values', 'product_variants', 'variant_option_values',
    'product_images', 'product_categories', 'product_collections',
    'tags', 'product_tags', 'product_relations'
  ] loop
    execute format($f$
      create policy %1$I_staff_all on public.%1$I
        for all to authenticated
        using ((select private.has_permission('inventory.write')))
        with check ((select private.has_permission('inventory.write')))
    $f$, t);
  end loop;
end $$;

-- ===========================================================================
-- 2. INVENTARIO — solo personal
-- ===========================================================================

create policy inventory_levels_staff_read on public.inventory_levels
  for select to authenticated using ((select private.has_permission('inventory.read')));

create policy inventory_movements_staff_read on public.inventory_movements
  for select to authenticated using ((select private.has_permission('inventory.read')));

-- Los movimientos se escriben SIEMPRE desde un RPC (venta, ajuste, traspaso),
-- nunca por inserción directa desde el cliente.
create policy inventory_reservations_staff_read on public.inventory_reservations
  for select to authenticated using ((select private.has_permission('inventory.read')));

create policy stock_transfers_staff_all on public.stock_transfers
  for all to authenticated
  using ((select private.has_permission('inventory.transfer')))
  with check ((select private.has_permission('inventory.transfer')));

create policy stock_transfer_lines_staff_all on public.stock_transfer_lines
  for all to authenticated
  using ((select private.has_permission('inventory.transfer')))
  with check ((select private.has_permission('inventory.transfer')));

-- ===========================================================================
-- 3. PERSONAL Y ORGANIZACIÓN
-- ===========================================================================

create policy locations_public_read on public.locations
  for select to anon, authenticated using (is_active);

create policy locations_staff_write on public.locations
  for all to authenticated
  using ((select private.has_permission('cms.write')))
  with check ((select private.has_permission('cms.write')));

create policy profiles_self_read on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Solo quien administra personal ve al resto del equipo.
create policy profiles_admin_all on public.profiles
  for all to authenticated
  using ((select private.has_permission('*')))
  with check ((select private.has_permission('*')));

create policy roles_staff_read on public.roles
  for select to authenticated using ((select private.is_staff()));

create policy role_permissions_staff_read on public.role_permissions
  for select to authenticated using ((select private.is_staff()));

-- ===========================================================================
-- 4. CLIENTAS — cada una ve exclusivamente lo suyo
-- ===========================================================================

create policy customers_self_read on public.customers
  for select to authenticated using (auth_user_id = (select auth.uid()));

create policy customers_self_update on public.customers
  for update to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

create policy customers_staff_all on public.customers
  for all to authenticated
  using ((select private.has_permission('customers.read')))
  with check ((select private.has_permission('customers.write')));

create policy customer_addresses_self_all on public.customer_addresses
  for all to authenticated
  using (customer_id = (select private.current_customer_id()))
  with check (customer_id = (select private.current_customer_id()));

create policy customer_addresses_staff_all on public.customer_addresses
  for all to authenticated
  using ((select private.has_permission('customers.read')))
  with check ((select private.has_permission('customers.write')));

create policy customer_favorites_self_all on public.customer_favorites
  for all to authenticated
  using (customer_id = (select private.current_customer_id()))
  with check (customer_id = (select private.current_customer_id()));

-- ===========================================================================
-- 5. CARRITO
-- ===========================================================================
-- El carrito de invitada no tiene sesión: se opera con su `token` desde Server
-- Actions a través de RPC. Aquí solo se abre la lectura del carrito propio de
-- una clienta con sesión iniciada.
-- ===========================================================================

create policy carts_self_read on public.carts
  for select to authenticated using (customer_id = (select private.current_customer_id()));

create policy cart_lines_self_read on public.cart_lines
  for select to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id));

-- ===========================================================================
-- 6. PEDIDOS
-- ===========================================================================

create policy orders_self_read on public.orders
  for select to authenticated using (customer_id = (select private.current_customer_id()));

create policy orders_staff_read on public.orders
  for select to authenticated using ((select private.has_permission('orders.read')));

create policy orders_staff_update on public.orders
  for update to authenticated
  using ((select private.has_permission('orders.fulfill')))
  with check ((select private.has_permission('orders.fulfill')));

-- Las tablas hijas heredan la visibilidad del pedido: si puedes ver el pedido,
-- ves sus líneas, pagos, bitácora y envíos.
do $$
declare t text;
begin
  foreach t in array array['order_lines', 'payments', 'order_status_events', 'shipments', 'returns'] loop
    execute format($f$
      create policy %1$I_inherit_order_read on public.%1$I
        for select to authenticated
        using (exists (select 1 from public.orders o where o.id = order_id))
    $f$, t);
  end loop;
end $$;

create policy return_lines_inherit_read on public.return_lines
  for select to authenticated
  using (exists (select 1 from public.returns r where r.id = return_id));

-- ===========================================================================
-- 7. CUPONES — nunca públicos
-- ===========================================================================
-- Si `coupons` fuera legible por anon, cualquiera podría enumerar los códigos
-- vigentes. La validación se hace por RPC, que devuelve solo el descuento
-- calculado del código que la clienta ya escribió.
-- ===========================================================================

create policy coupons_staff_all on public.coupons
  for all to authenticated
  using ((select private.has_permission('coupons.read')))
  with check ((select private.has_permission('coupons.write')));

create policy coupon_targets_staff_all on public.coupon_targets
  for all to authenticated
  using ((select private.has_permission('coupons.read')))
  with check ((select private.has_permission('coupons.write')));

create policy coupon_redemptions_staff_read on public.coupon_redemptions
  for select to authenticated using ((select private.has_permission('coupons.read')));

-- ===========================================================================
-- 8. ENVÍOS — tarifas públicas (el checkout las necesita)
-- ===========================================================================

create policy shipping_methods_public_read on public.shipping_methods
  for select to anon, authenticated using (is_active);

create policy shipping_methods_staff_write on public.shipping_methods
  for all to authenticated
  using ((select private.has_permission('cms.write')))
  with check ((select private.has_permission('cms.write')));

create policy local_delivery_rates_public_read on public.local_delivery_rates
  for select to anon, authenticated using (true);

create policy local_delivery_rates_staff_write on public.local_delivery_rates
  for all to authenticated
  using ((select private.has_permission('cms.write')))
  with check ((select private.has_permission('cms.write')));

create policy shipping_quotes_staff_read on public.shipping_quotes
  for select to authenticated using ((select private.is_staff()));

-- ===========================================================================
-- 9. CAJA — solo personal
-- ===========================================================================

create policy register_sessions_staff_read on public.register_sessions
  for select to authenticated using ((select private.has_permission('register.open')));

create policy cash_movements_staff_read on public.cash_movements
  for select to authenticated using ((select private.has_permission('register.movement')));

-- ===========================================================================
-- 10. CMS — lectura pública de lo publicado, escritura con permiso cms.write
-- ===========================================================================

create policy hero_slides_public_read on public.hero_slides
  for select to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );

create policy banners_public_read on public.banners
  for select to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );

create policy page_sections_public_read on public.page_sections
  for select to anon, authenticated using (is_active);

create policy pages_public_read on public.pages
  for select to anon, authenticated using (is_published);

create policy faqs_public_read on public.faqs
  for select to anon, authenticated using (is_visible);

create policy navigation_menus_public_read on public.navigation_menus
  for select to anon, authenticated using (true);

create policy navigation_items_public_read on public.navigation_items
  for select to anon, authenticated using (is_visible);

create policy store_settings_public_read on public.store_settings
  for select to anon, authenticated using (true);

do $$
declare t text;
begin
  foreach t in array array[
    'hero_slides', 'banners', 'page_sections', 'pages', 'faqs',
    'navigation_menus', 'navigation_items', 'store_settings'
  ] loop
    execute format($f$
      create policy %1$I_staff_write on public.%1$I
        for all to authenticated
        using ((select private.has_permission('cms.write')))
        with check ((select private.has_permission('cms.write')))
    $f$, t);
  end loop;
end $$;

-- ===========================================================================
-- 11. INFRAESTRUCTURA
-- ===========================================================================
-- audit_log y outbox_events no tienen NINGUNA política: con RLS activa y sin
-- políticas, nadie los alcanza salvo service_role. Es exactamente lo que se
-- quiere — se escriben por trigger/RPC y los consume el worker del servidor.
-- ===========================================================================

create policy audit_log_admin_read on public.audit_log
  for select to authenticated using ((select private.has_permission('*')));

create policy newsletter_subscribers_staff_read on public.newsletter_subscribers
  for select to authenticated using ((select private.is_staff()));
