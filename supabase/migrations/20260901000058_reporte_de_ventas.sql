-- ============================================================================
-- Lumane · 0058 · El reporte de ventas
-- ============================================================================
-- Estrena `reports.read`, un permiso que existe desde la migración 0002, lo
-- tiene `manager` (y `owner` por su `*`) y que hasta hoy no protegía nada
-- porque no había una sola función que lo pidiera.
--
-- Vive en `/admin` y no en el POS, por decisión del plan: son tablas densas
-- que se leen sentada, y el navegador da copiar y exportar que React Native
-- no. La misma función sirve a los dos lados si algún día hace falta.
--
-- ---------------------------------------------------------------------------
-- La zona horaria no es un detalle
-- ---------------------------------------------------------------------------
-- La boutique está en `America/Mazatlan` (UTC−7) y Postgres guarda todo en
-- UTC. Agrupar por `placed_at::date` mandaría cada venta de después de las
-- 17:00 al día siguiente — en una tienda que cierra a las 20:00, eso es buena
-- parte de la tarde contada en el día que no fue.
--
-- No es hipotético: los dos pedidos que hay en producción se hicieron el 22 de
-- septiembre por la tarde y en UTC figuran como del 23. Un reporte que dijera
-- «el 23 vendiste $14,578» estaría mal ya el primer día, y nadie lo notaría
-- hasta cuadrar contra el corte de caja.
--
-- Por eso `p_from` y `p_to` son `date` y no `timestamptz`: «del 1 al 30 de
-- septiembre» significa días de la tienda, no ventanas UTC. La conversión se
-- hace UNA vez, aquí, contra `locations.timezone`.
--
-- ---------------------------------------------------------------------------
-- Qué cuenta como venta
-- ---------------------------------------------------------------------------
-- Todo pedido de la sucursal en el rango que no esté en `draft` ni
-- `cancelled`. Un cancelado devolvió su inventario y no es ingreso.
--
-- Se informan por separado **lo vendido** (`bruto_cents`, la suma de los
-- totales) y **lo cobrado** (`cobrado_cents`, la suma de los pagos). No son lo
-- mismo y confundirlos es el error clásico de un reporte de tienda: un pedido
-- por transferencia que todavía no se ha recibido ya es una venta pero no es
-- dinero en la cuenta. Verlos juntos es lo que permite detectar el hueco.
--
-- Los importes llevan el IVA DENTRO, como en toda la base (regla 4):
-- `total_cents` es lo que pagó la clienta y `tax_cents` es el impuesto que ya
-- venía incluido, no algo que se sume. Por eso la base gravable se calcula
-- restando, nunca multiplicando.
-- ============================================================================

create or replace function public.sales_report(
  p_from        date default null,
  p_to          date default null,
  p_location_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_location uuid;
  v_tz       text;
  v_desde    date;
  v_hasta    date;
  v_ini      timestamptz;
  v_fin      timestamptz;
  v_reporte  jsonb;
begin
  if not private.has_permission('reports.read') then
    raise exception 'No tienes permiso para ver los reportes'
      using errcode = 'insufficient_privilege';
  end if;

  v_location := coalesce(p_location_id, private.current_location_id());

  select coalesce(l.timezone, 'UTC')
  into v_tz
  from public.locations l
  where l.id = v_location;

  if v_tz is null then
    raise exception 'No existe esa sucursal' using errcode = 'no_data_found';
  end if;

  -- Por omisión, los últimos 30 días contados en la zona de la tienda. `now()`
  -- en UTC daría «mañana» durante las últimas siete horas de cada día.
  v_hasta := coalesce(p_to, (now() at time zone v_tz)::date);
  v_desde := coalesce(p_from, v_hasta - 29);

  if v_desde > v_hasta then
    raise exception 'La fecha inicial es posterior a la final'
      using errcode = 'check_violation';
  end if;

  -- Medianoche local de cada extremo. El final es EXCLUSIVO y se toma del día
  -- siguiente: con `<=` sobre `v_hasta` se perdería todo lo vendido ese día
  -- después de las 00:00:00, que es todo.
  v_ini := v_desde::timestamp at time zone v_tz;
  v_fin := (v_hasta + 1)::timestamp at time zone v_tz;

  with pedidos as (
    -- La definición de «venta» vive AQUÍ y en un solo sitio. Repetir este
    -- filtro en cada agregado es cómo un reporte acaba contradiciéndose a sí
    -- mismo entre el resumen y el desglose.
    select o.id, o.channel, o.placed_at, o.total_cents, o.discount_cents,
           o.shipping_cents, o.tax_cents
    from public.orders o
    where o.location_id = v_location
      and o.placed_at >= v_ini
      and o.placed_at <  v_fin
      and o.status not in ('draft'::public.order_status, 'cancelled'::public.order_status)
  ),
  lineas as (
    select ol.product_id, ol.product_name, ol.quantity, ol.total_cents
    from public.order_lines ol
    join pedidos p on p.id = ol.order_id
  ),
  devoluciones as (
    -- Se fechan por CUÁNDO SE DEVOLVIÓ, no por cuándo se vendió: una
    -- devolución de una venta de hace un mes es dinero que sale hoy, y en el
    -- reporte de hoy tiene que aparecer.
    select r.refund_amount_cents
    from public.returns r
    join public.orders o on o.id = r.order_id
    where o.location_id = v_location
      and r.created_at >= v_ini
      and r.created_at <  v_fin
      and r.status <> 'rejected'::public.return_status
  ),
  cobros as (
    -- Incluye los pagos negativos que `pos_create_return` inserta para que el
    -- corte cuadre, así que esto ya es dinero NETO movido en el periodo.
    select pay.method, pay.amount_cents
    from public.payments pay
    join public.orders o on o.id = pay.order_id
    where o.location_id = v_location
      and pay.created_at >= v_ini
      and pay.created_at <  v_fin
  ),
  totales as (
    select
      (select count(*)                             from pedidos)      as n_pedidos,
      (select coalesce(sum(total_cents), 0)        from pedidos)      as bruto,
      (select coalesce(sum(discount_cents), 0)     from pedidos)      as descuentos,
      (select coalesce(sum(shipping_cents), 0)     from pedidos)      as envios,
      (select coalesce(sum(tax_cents), 0)          from pedidos)      as iva,
      (select coalesce(sum(quantity), 0)           from lineas)       as piezas,
      (select count(*)                             from devoluciones) as n_devoluciones,
      (select coalesce(sum(refund_amount_cents),0) from devoluciones) as devuelto,
      (select coalesce(sum(amount_cents), 0)       from cobros)       as cobrado
  )
  select jsonb_build_object(
    'desde',       v_desde,
    'hasta',       v_hasta,
    'zona',        v_tz,
    'location_id', v_location,

    'resumen', jsonb_build_object(
      'pedidos',          t.n_pedidos,
      'piezas',           t.piezas,
      'bruto_cents',      t.bruto,
      -- La base gravable se RESTA, no se multiplica: el IVA ya viene dentro.
      'base_cents',       t.bruto - t.iva,
      'iva_cents',        t.iva,
      'descuentos_cents', t.descuentos,
      'envios_cents',     t.envios,
      'devoluciones',     t.n_devoluciones,
      'devoluciones_cents', t.devuelto,
      'neto_cents',       t.bruto - t.devuelto,
      'cobrado_cents',    t.cobrado,
      'ticket_promedio_cents',
        case when t.n_pedidos = 0 then 0
             else round(t.bruto::numeric / t.n_pedidos)::bigint end
    ),

    'por_canal', coalesce((
      select jsonb_agg(jsonb_build_object(
               'canal',       c.channel,
               'pedidos',     c.pedidos,
               'bruto_cents', c.bruto
             ) order by c.bruto desc)
      from (
        select p.channel::text as channel, count(*) as pedidos,
               coalesce(sum(p.total_cents), 0) as bruto
        from pedidos p group by p.channel
      ) c
    ), '[]'::jsonb),

    'por_metodo_pago', coalesce((
      select jsonb_agg(jsonb_build_object(
               'metodo', m.method,
               'cobros', m.cobros,
               'cents',  m.cents
             ) order by m.cents desc)
      from (
        select c.method::text as method, count(*) as cobros,
               coalesce(sum(c.amount_cents), 0) as cents
        from cobros c group by c.method
      ) m
    ), '[]'::jsonb),

    'por_dia', coalesce((
      -- `generate_series` y no `group by`: un día sin ventas tiene que salir
      -- con cero. Si se omitieran las filas vacías, una semana floja se
      -- dibujaría como una línea continua y parecería normal.
      select jsonb_agg(jsonb_build_object(
               'dia',         d.dia,
               'pedidos',     d.pedidos,
               'bruto_cents', d.bruto
             ) order by d.dia)
      from (
        select serie.dia::date as dia,
               count(p.id)                     as pedidos,
               coalesce(sum(p.total_cents), 0) as bruto
        from generate_series(v_desde, v_hasta, interval '1 day') as serie(dia)
        left join pedidos p
          on (p.placed_at at time zone v_tz)::date = serie.dia::date
        group by serie.dia
      ) d
    ), '[]'::jsonb),

    'top_prendas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_id',   x.product_id,
               'product_name', x.product_name,
               'piezas',       x.piezas,
               'cents',        x.cents
             ) order by x.cents desc)
      from (
        select l.product_id,
               -- El nombre se toma de la línea y no del catálogo: es el que
               -- tenía la prenda cuando se vendió. Si mañana se renombra, el
               -- reporte de septiembre debe seguir diciendo lo que se vendió.
               min(l.product_name) as product_name,
               sum(l.quantity)     as piezas,
               sum(l.total_cents)  as cents
        from lineas l
        group by l.product_id
        order by sum(l.total_cents) desc
        limit 10
      ) x
    ), '[]'::jsonb)
  )
  into v_reporte
  from totales t;

  return v_reporte;
end;
$$;

comment on function public.sales_report(date, date, uuid) is
  'Reporte de ventas por rango de días de la sucursal (no UTC). Separa lo vendido de lo cobrado; el IVA va dentro de los importes.';

revoke execute on function public.sales_report(date, date, uuid) from public, anon;
grant  execute on function public.sales_report(date, date, uuid) to authenticated;
