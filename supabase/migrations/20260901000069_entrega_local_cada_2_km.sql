-- ============================================================================
-- Lumane · 0069 · Entrega local en tramos de 2 km, hasta 10 km
-- ============================================================================
-- Pedido de la propietaria: la entrega dentro de la ciudad se cobra por
-- tramos de 2 km —0–2, 2–4, 4–6, 6–8 y 8–10— y más allá de 10 km no se
-- ofrece: esa clienta paga envío estándar o express como cualquier otra.
--
-- Los tramos de antes eran 0–3, 3–6, 6–10 y 10–15. Se borran y se escriben
-- los nuevos; no hay pedidos que dependan de las filas (el pedido guarda su
-- costo de envío ya calculado, no una referencia al tramo).
--
-- **El límite de 10 km no es una constante en ningún sitio: es que no hay
-- tramo más allá.** `quote_shipping_cents` devuelve NULL cuando la distancia
-- no cae en ningún tramo, y NULL ya significa «este método no aplica a tu
-- dirección». Por eso el panel deja cambiar el PRECIO de cada tramo pero no
-- sus kilómetros: mover un límite ahí sería mover la zona de cobertura sin
-- darse cuenta.
--
-- Los rangos son `[min, max)`: 2.0 km exactos cae en 2–4, no en 0–2. Así
-- ninguna distancia cae en dos tramos a la vez.
--
-- Precios de arranque, siguiendo los anteriores ($50 el primero, $100 el de
-- 6–10); la propietaria los ajusta en /admin/envios.
-- ============================================================================

do $$
declare
  v_metodo uuid;
begin
  select id into v_metodo from public.shipping_methods where code = 'local';
  if v_metodo is null then raise exception 'no existe el método de entrega local'; end if;

  delete from public.local_delivery_rates where shipping_method_id = v_metodo;

  insert into public.local_delivery_rates (shipping_method_id, min_km, max_km, price_cents, position)
  values
    (v_metodo, 0, 2,  5000,  1),
    (v_metodo, 2, 4,  6000,  2),
    (v_metodo, 4, 6,  7000,  3),
    (v_metodo, 6, 8,  8500,  4),
    (v_metodo, 8, 10, 10000, 5);

  -- La descripción la ve la clienta bajo el nombre del método.
  update public.shipping_methods
  set description = 'Hasta 10 km de la boutique · el mismo día o al siguiente'
  where id = v_metodo;
end
$$;

-- La página de envíos decía «desde $50 MXN»: si la propietaria cambia el
-- primer tramo desde el panel, esa cifra quedaría vieja sin que nadie lo note.
-- Se describe la regla, no el precio.
do $$
declare
  antes text;
  despues text;
begin
  select body into antes from public.pages where slug = 'envios-y-devoluciones';

  despues := replace(antes,
    '| Entrega local (Los Mochis) | Según distancia, desde $50 MXN | El mismo día o al siguiente |',
    '| Entrega local | Según distancia, hasta 10 km de la boutique | El mismo día o al siguiente |');
  if despues = antes then raise exception 'envíos: no encontré la fila de entrega local'; end if;
  antes := despues;

  despues := replace(antes,
    'Si tu dirección está en Los Mochis, el costo se calcula por la distancia real desde la boutique.',
    'Si tu dirección está a 10 km o menos de la boutique, te ofrecemos entrega local en cuanto la '
      || 'escribes en el pago. El costo se calcula por la distancia real en coche, en tramos de 2 km.');
  if despues = antes then raise exception 'envíos: no encontré el párrafo de entrega local'; end if;

  update public.pages set body = despues where slug = 'envios-y-devoluciones';
end
$$;
