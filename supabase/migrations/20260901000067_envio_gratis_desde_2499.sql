-- ============================================================================
-- Lumane · 0067 · Envío sin costo desde $2,499, y que sea verdad
-- ============================================================================
-- La propietaria pidió cambiar la barra de servicios de la portada: «Envío
-- express sin costo desde $10,000» pasa a $2,499 y para todos los envíos, y
-- «Pago seguro y meses sin intereses» pasa a «Pago 100% seguro».
--
-- ---------------------------------------------------------------------------
-- El hallazgo: la barra prometía algo que el pago nunca hizo
-- ---------------------------------------------------------------------------
-- `store_settings.free_shipping_over_cents` estaba en NULL, y también
-- `free_over_cents` de los cuatro métodos. Con NULL, `quote_shipping_cents`
-- nunca regala el envío: una clienta que compraba $12,000 leía «sin costo
-- desde $10,000» en la portada y veía $219 de express en el resumen. Cambiar
-- solo el texto habría movido la promesa incumplida de $10,000 a $2,499.
--
-- Por eso esto fija el umbral de verdad, en el global y no por método: «todos
-- los envíos» es exactamente lo que resuelve el `coalesce(m.free_over_cents,
-- s.free_shipping_over_cents)` cuando ningún método tiene umbral propio. Sigue
-- sin estar en /admin/ajustes a propósito (ver el comentario de esa página):
-- es una regla de cobro, no un texto.
--
-- Se compara contra subtotal MENOS descuento, que es lo que ya le pasa
-- `compute_totals`: un cupón que baja la compra de $2,600 a $2,300 la deja
-- bajo el umbral. Es lo justo, y es como funciona en casi todas las tiendas.
--
-- ---------------------------------------------------------------------------
-- La entrega local no miraba el umbral
-- ---------------------------------------------------------------------------
-- La 0013 lo aplicaba solo a los métodos `flat` (estándar y express): la rama
-- de `local_delivery` devolvía la tarifa por distancia sin consultarlo. Con un
-- umbral puesto, quien vive en Los Mochis habría pagado la entrega local
-- mientras alguien en Monterrey recibía el express gratis.
--
-- Ahora la entrega local también sale gratis desde el umbral, pero SOLO dentro
-- de la zona de cobertura: fuera de ella `v_price` es NULL, que significa «este
-- método no aplica a tu dirección», y eso no cambia por gastar más. Regalar
-- una entrega que no hacemos no es regalar nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Costo de envío. Igual que en la 0013 salvo la rama de `local_delivery`.
-- ---------------------------------------------------------------------------
create or replace function private.quote_shipping_cents(
  p_method_code    text,
  p_subtotal_cents bigint,
  p_distance_meters integer default null
)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  m public.shipping_methods%rowtype;
  v_km numeric;
  v_price bigint;
  v_free_over bigint;
begin
  select * into m from public.shipping_methods
  where code = p_method_code and is_active;

  if not found then
    return null;
  end if;

  -- Umbral de envío gratis: el del método, o el global de la tienda.
  select coalesce(m.free_over_cents, s.free_shipping_over_cents)
    into v_free_over
  from public.store_settings s where s.id;

  if m.kind = 'pickup' then
    return 0;
  end if;

  if m.kind = 'local_delivery' then
    if p_distance_meters is null then
      -- Sin distancia no hay tarifa: el checkout debe pedir la dirección antes.
      return null;
    end if;
    v_km := p_distance_meters::numeric / 1000.0;
    select r.price_cents into v_price
    from public.local_delivery_rates r
    where r.shipping_method_id = m.id
      and v_km >= r.min_km and v_km < r.max_km
    order by r.min_km
    limit 1;
    -- Fuera del radio de cobertura configurado: el método no aplica, gaste lo
    -- que gaste. El umbral solo regala entregas que sí hacemos.
    if v_price is null then
      return null;
    end if;
    if v_free_over is not null and p_subtotal_cents >= v_free_over then
      return 0;
    end if;
    return v_price;
  end if;

  -- kind = 'flat'
  if v_free_over is not null and p_subtotal_cents >= v_free_over then
    return 0;
  end if;
  return m.price_cents;
end;
$$;

comment on function private.quote_shipping_cents(text, bigint, integer) is
  'Costo de envío según la configuración vigente. Null = el método no aplica a este pedido.';

-- ---------------------------------------------------------------------------
-- El umbral: $2,499.00
-- ---------------------------------------------------------------------------
update public.store_settings
set free_shipping_over_cents = 249900
where id;

-- ---------------------------------------------------------------------------
-- La barra de servicios. «Asesoría por WhatsApp» y «14 días para cambiar de
-- opinión» se quedan como están.
-- ---------------------------------------------------------------------------
do $$
begin
  update public.banners
  set title = 'Envío sin costo desde $2,499'
  where slot_key = 'services' and title = 'Envío express sin costo desde $10,000';
  if not found then raise exception 'services: no encontré la franja de envío'; end if;

  update public.banners
  set title = 'Pago 100% seguro'
  where slot_key = 'services' and title = 'Pago seguro y meses sin intereses';
  if not found then raise exception 'services: no encontré la franja de pago'; end if;
end
$$;
