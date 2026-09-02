-- ============================================================================
-- Lumane · Siembra inicial
-- ============================================================================
-- Contenido de arranque tomado del prototipo: las nueve categorías, cinco
-- colecciones, once piezas con sus variantes de talla, la portada, la franja
-- de servicios y las existencias iniciales.
--
-- Es IDEMPOTENTE: se puede correr las veces que haga falta sin duplicar nada
-- (todos los `insert` llevan `on conflict do nothing` sobre su slug o SKU).
--
-- Las rutas de imagen apuntan a `/prototipo/...` en `apps/web/public`. Cuando
-- las fotos se suban a Supabase Storage bastará con actualizar la columna
-- `storage_path`: ni el código ni las consultas cambian (ver `lib/images.ts`).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Categorías
-- ---------------------------------------------------------------------------
-- Las fotos y sus textos alternativos son los del prototipo, literalmente: el
-- alt describe la FOTOGRAFÍA ("Modelo con vestido largo de encaje negro…"), no
-- la categoría. Un alt que repite la etiqueta no aporta nada a quien navega
-- con lector de pantalla.
insert into public.categories (name, slug, image_path, image_alt, position) values
  ('Vestidos', 'vestidos', '/prototipo/e62dac966ff543b58816b85e295d6bf2.webp',
   'Modelo con vestido largo de encaje negro y top semitransparente, ejemplo de la categoría Vestidos.', 1),
  ('Sets', 'sets', '/prototipo/65b7f1862abb439e9b1529b369edf803.webp',
   'Conjunto de blazer y short en rosa pastel con botones dorados, ejemplo de la categoría Sets.', 2),
  ('Pantalones', 'pantalones', '/prototipo/ddd6460284d94232aa73373e110ab4c1.webp',
   'Modelo con top acanalado sin mangas y pantalón ancho en tono crudo, ejemplo de la categoría Pantalones.', 3),
  ('Suéters / cardigans', 'sueters-cardigans', '/prototipo/6d2d55869f2048cfa51685348b6c4c4f.webp',
   'Modelo con chaleco entallado de rayas en tono crema, ejemplo de la categoría Suéters y cardigans.', 4),
  ('Abrigos', 'abrigos', '/prototipo/8abac1f6017342a7b942a010402ac7d7.jpg',
   'Modelo con camisa oversize de lino café, ejemplo de la categoría Abrigos.', 5),
  ('Tops / bodies', 'tops-bodies', '/prototipo/whatsappimage20250813at5.54.32pm.webp',
   'Mini vestido floral rosa de tirantes, ejemplo de la categoría Tops y bodies.', 6),
  ('Camisas', 'camisas', '/prototipo/f789b7cdf65d4efbb03c7e77f8917de2.webp',
   'Camisa de rayas finas en tonos café sobre fondo crudo, ejemplo de la categoría Camisas.', 7),
  ('Shorts y bermudas', 'shorts-bermudas', '/prototipo/d89112b8bcd7401f8d7a7963c64b3c7d.webp',
   'Conjunto de camisa y bermuda en algodón blanco, ejemplo de la categoría Shorts y bermudas.', 8),
  ('Bolsos', 'bolsos', '/prototipo/deeb2f5c2ea44c0e8f61de52dfce5e72.webp',
   'Bolso de piel negra con tachuelas y herrajes plateados, ejemplo de la categoría Bolsos.', 9)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Colecciones
-- ---------------------------------------------------------------------------
insert into public.collections
  (name, slug, description, image_path, banner_path, badge_label, position, is_visible) values
  ('Primavera / Verano', 'primavera-verano',
   'Estampados florales, telas ligeras y siluetas sueltas para los días largos.',
   '/prototipo/whatsappimage20250813at5.54.32pm.webp',
   '/prototipo/whatsappimage20250813at5.54.32pm.webp', null, 1, true),
  ('Otoño / Invierno', 'otono-invierno',
   'Capas, punto y tonos profundos. Piezas que se quedan más de una temporada.',
   '/prototipo/6d2d55869f2048cfa51685348b6c4c4f.webp', null, null, 2, true),
  ('Cápsula Fin de Semana', 'capsula-fin-de-semana',
   'Doce piezas que se combinan entre sí. Para hacer maleta sin pensarlo.',
   '/prototipo/d89112b8bcd7401f8d7a7963c64b3c7d.webp', null, null, 3, true),
  ('Serie Lunares', 'serie-lunares',
   'Una cápsula de autor en tiraje corto. Cuando se agota, no vuelve a producirse.',
   '/prototipo/img1927mejoradonr.webp', null, 'Edición limitada', 4, true),
  ('Básicos Atemporales', 'basicos-atemporales',
   'Lo que sostiene el armario: cortes limpios, colores que no pasan.',
   '/prototipo/8abac1f6017342a7b942a010402ac7d7.jpg', null, null, 5, true)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Productos, variantes de talla, fotografía y existencias
-- ---------------------------------------------------------------------------
-- Se genera con un bloque procedimental en vez de a mano: once productos por
-- cuatro tallas son cuarenta y cuatro variantes, cada una con su SKU, su
-- código de barras y su nivel de inventario. Escribirlas a mano sería una
-- fuente segura de erratas.
-- ---------------------------------------------------------------------------
do $$
declare
  p record;
  v_product_id uuid;
  v_option_id  uuid;
  v_value_id   uuid;
  v_variant_id uuid;
  v_location   uuid;
  v_size       text;
  v_sizes      text[];
  v_stock      integer;
  v_idx        integer;
  v_prefix     text;
begin
  select id into v_location from public.locations where is_default;

  for p in
    select * from (values
      -- nombre, slug, precio, precio_anterior, descripcion_corta, imagen, alt, categoria, coleccion, tallas
      ('Conjunto Estructurado Ônix', 'conjunto-estructurado-onix', 875000::bigint, 1250000::bigint,
       'Estampado geométrico · negro',
       '/prototipo/6df08eaa88f54a39a78e66bcaa665f8e.webp',
       'Conjunto de camisa y pantalón ancho en negro con estampado geométrico de líneas blancas, modelo sentada en silla de director.',
       'sets', 'basicos-atemporales', array['XS','S','M','L']),

      ('Vestido Encaje Negro', 'vestido-encaje-negro', 1120000::bigint, null::bigint,
       'Encaje · manga larga',
       '/prototipo/e62dac966ff543b58816b85e295d6bf2.webp',
       'Modelo con vestido largo de encaje negro y top semitransparente de manga larga, sosteniendo una bolsa de compras LUMANE.',
       'vestidos', 'otono-invierno', array['XS','S','M','L']),

      ('Conjunto Punto Crema', 'conjunto-punto-crema', 787500::bigint, 1050000::bigint,
       'Punto suave · crudo',
       '/prototipo/ddd6460284d94232aa73373e110ab4c1.webp',
       'Conjunto de punto en color crema compuesto por top y falda midi.',
       'sueters-cardigans', 'otono-invierno', array['XS','S','M','L']),

      ('Conjunto Blazer Rosa', 'conjunto-blazer-rosa', 588000::bigint, 980000::bigint,
       'Rosa pastel · botones dorados',
       '/prototipo/65b7f1862abb439e9b1529b369edf803.webp',
       'Conjunto de blazer y short en rosa pastel con botones dorados.',
       'sets', 'primavera-verano', array['XS','S','M','L']),

      ('Conjunto Camisero Café', 'conjunto-camisero-cafe', 736000::bigint, 920000::bigint,
       'Lino · café tostado',
       '/prototipo/8abac1f6017342a7b942a010402ac7d7.jpg',
       'Conjunto camisero en lino color café tostado, camisa oversize y pantalón recto.',
       'camisas', 'basicos-atemporales', array['XS','S','M','L']),

      ('Vestido Serie Lunares', 'vestido-serie-lunares', 840000::bigint, null::bigint,
       'Edición limitada · 40 piezas',
       '/prototipo/img1927mejoradonr.webp',
       'Modelo con conjunto de blusa y falda corta en crudo con estampado de lunares negros.',
       'vestidos', 'serie-lunares', array['XS','S','M','L']),

      ('Conjunto Bermuda Blanco', 'conjunto-bermuda-blanco', 513500::bigint, 790000::bigint,
       'Algodón · blanco óptico',
       '/prototipo/d89112b8bcd7401f8d7a7963c64b3c7d.webp',
       'Conjunto de camisa y bermuda en algodón blanco.',
       'shorts-bermudas', 'capsula-fin-de-semana', array['XS','S','M','L']),

      ('Camisa Rayada Café', 'camisa-rayada-cafe', 518000::bigint, 740000::bigint,
       'Rayas finas · café',
       '/prototipo/f789b7cdf65d4efbb03c7e77f8917de2.webp',
       'Camisa de rayas finas en tonos café sobre fondo crudo.',
       'camisas', 'capsula-fin-de-semana', array['XS','S','M','L']),

      ('Vestido Floral Rosa', 'vestido-floral-rosa', 552000::bigint, 690000::bigint,
       'Mini · estampado floral',
       '/prototipo/whatsappimage20250813at5.54.32pm.webp',
       'Mini vestido floral rosa de tirantes con falda evasé.',
       'vestidos', 'primavera-verano', array['XS','S','M','L']),

      ('Bolso Tachuelas Piel', 'bolso-tachuelas-piel', 315000::bigint, 420000::bigint,
       'Piel · herrajes plateados',
       '/prototipo/deeb2f5c2ea44c0e8f61de52dfce5e72.webp',
       'Bolso de piel negra con tachuelas y herrajes plateados.',
       'bolsos', 'basicos-atemporales', array['Única']),

      ('Chaleco Rayado Crema', 'chaleco-rayado-crema', 294000::bigint, 420000::bigint,
       'Punto · rayas crema',
       '/prototipo/6d2d55869f2048cfa51685348b6c4c4f.webp',
       'Chaleco de punto con rayas en tonos crema y café.',
       'sueters-cardigans', 'otono-invierno', array['XS','S','M','L'])
    ) as t(name, slug, price_cents, compare_cents, short_description, image_path, image_alt,
           category_slug, collection_slug, sizes)
  loop
    -- Ya sembrado en una ejecución anterior: no se toca.
    if exists (select 1 from public.products where slug = p.slug) then
      continue;
    end if;

    insert into public.products
      (name, slug, short_description, status, is_online, published_at, primary_category_id,
       seo_title, seo_description)
    values (
      p.name, p.slug, p.short_description, 'active', true, now(),
      (select id from public.categories where slug = p.category_slug),
      p.name || ' · LUMANE',
      p.short_description
    )
    returning id into v_product_id;

    insert into public.product_categories (product_id, category_id)
    select v_product_id, id from public.categories where slug = p.category_slug;

    insert into public.product_collections (product_id, collection_id)
    select v_product_id, id from public.collections where slug = p.collection_slug;

    insert into public.product_images (product_id, storage_path, alt_text, position)
    values (v_product_id, p.image_path, p.image_alt, 0);

    insert into public.product_options (product_id, name, position)
    values (v_product_id, 'Talla', 0)
    returning id into v_option_id;

    -- Prefijo de SKU legible en el ticket: tres letras de las dos primeras
    -- palabras del slug (LM-CONEST, LM-VESENC, LM-CAMRAY…).
    -- Tomar los seis primeros caracteres del slug sin más NO sirve: todos los
    -- "conjunto-…" darían LM-CONJUN y chocarían entre sí.
    v_prefix := 'LM-' || upper(
      substr(split_part(p.slug, '-', 1), 1, 3) ||
      coalesce(
        nullif(substr(split_part(p.slug, '-', 2), 1, 3), ''),
        substr(split_part(p.slug, '-', 1), 4, 3)
      )
    );
    v_sizes := p.sizes;
    v_idx := 0;

    foreach v_size in array v_sizes
    loop
      v_idx := v_idx + 1;

      insert into public.product_option_values (option_id, value, position)
      values (v_option_id, v_size, v_idx)
      returning id into v_value_id;

      insert into public.product_variants
        (product_id, title, sku, barcode, price_cents, compare_at_price_cents,
         cost_cents, weight_grams, position)
      values (
        v_product_id, v_size,
        v_prefix || '-' || upper(replace(v_size, 'Ú', 'U')),
        -- Código de barras ficticio pero único y con formato EAN-13.
        '750' || lpad((abs(hashtext(p.slug || v_size)) % 10000000000)::text, 10, '0'),
        p.price_cents, p.compare_cents,
        round(p.price_cents * 0.38), 450, v_idx
      )
      returning id into v_variant_id;

      insert into public.variant_option_values (variant_id, option_value_id)
      values (v_variant_id, v_value_id);

      -- Existencias con forma de boutique real: pocas piezas por talla, las
      -- extremas más escasas. La M del vestido de encaje arranca agotada para
      -- que el estado "sin stock" sea visible desde el primer día.
      v_stock := case v_size
        when 'XS' then 2 when 'S' then 4 when 'M' then 3 when 'L' then 1 else 5 end;
      if p.slug = 'vestido-encaje-negro' and v_size = 'M' then
        v_stock := 0;
      end if;

      if v_stock > 0 then
        insert into public.inventory_movements
          (variant_id, location_id, type, quantity_delta, unit_cost_cents, note)
        values (v_variant_id, v_location, 'initial', v_stock, round(p.price_cents * 0.38),
                'Carga inicial de catálogo');
      end if;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Portada
-- ---------------------------------------------------------------------------
insert into public.hero_slides
  (page_key, image_path, image_alt, eyebrow, title, subtitle,
   cta_label, cta_href, secondary_cta_label, secondary_cta_href, position)
select
  'home',
  '/prototipo/e62dac966ff543b58816b85e295d6bf2.webp',
  'Modelo con vestido largo de encaje negro y top semitransparente de manga larga, sosteniendo una bolsa de compras LUMANE.',
  'Colección de temporada · 2026',
  E'La nueva\nsilueta',
  'Formas estructuradas y texturas táctiles para el armario de todos los días. Piezas que se quedan más de una temporada.',
  'Ver colección', '/catalogo',
  'Pieza destacada', '/producto/vestido-encaje-negro',
  1
where not exists (select 1 from public.hero_slides where page_key = 'home');

-- ---------------------------------------------------------------------------
-- Franja de servicios
-- ---------------------------------------------------------------------------
-- `cta_label` guarda el nombre del glifo de Material Symbols: así la boutique
-- puede añadir o cambiar una promesa desde el administrador sin tocar código.
-- ---------------------------------------------------------------------------
insert into public.banners (slot_key, title, cta_label, position)
select * from (values
  ('services', 'Envío express sin costo desde $10,000', 'local_shipping', 1),
  ('services', 'Pago seguro y meses sin intereses',     'credit_card',    2),
  ('services', '14 días para cambiar de opinión',       'autorenew',      3),
  ('services', 'Asesoría por WhatsApp',                 'chat',           4)
) as t(slot_key, title, cta_label, position)
where not exists (select 1 from public.banners where slot_key = 'services');
