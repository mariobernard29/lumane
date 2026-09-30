/**
 * Los correos que la boutique se manda a sí misma.
 *
 * Son otra cosa que los de las clientas y por eso viven aparte. Un correo a la
 * clienta persuade y tranquiliza; estos informan a quien ya sabe de qué van y
 * los va a leer de reojo en el teléfono. De ahí las tres diferencias:
 *
 *  1. **El asunto lleva la cifra.** «Corte del día · $4,820.00» se lee entero
 *     en la bandeja sin abrir nada, que es como se van a consumir la mayoría.
 *  2. **No hay pie de atención a clientas.** Nada de «¿alguna duda?
 *     contéstanos»: el destinatario ES la tienda.
 *  3. **Las horas van en la zona de la sucursal.** Postgres entrega UTC y en
 *     Los Mochis eso son siete horas de diferencia: un corte cerrado a las
 *     20:30 aparecería como de las 03:30 del día siguiente.
 */

import { esc, pesos, DISPLAY, FONDO, LINEA, PAPEL, TENUE, TEXTO, TINTA, type Carga, type Correo } from './plantillas.ts'

export interface Sesion {
  id: string
  opened_at: string | null
  closed_at: string | null
  opening_float_cents: number | string | null
  expected_cash_cents: number | string | null
  counted_cash_cents: number | string | null
  difference_cents: number | string | null
  notes: string | null
  location: string | null
  timezone: string | null
  opened_by: string | null
  closed_by: string | null
}

export interface CargaAviso {
  admin_email: string
  store: { name: string | null; email: string | null; phone: string | null; website: string | null }
  session?: Sesion
  by_method?: Record<string, { amount_cents: number | string; count: number }>
  sales?: { number: string; placed_at: string | null; total_cents: number | string; customer: string | null }[]
  cash_movements?: { direction: string; amount_cents: number | string; reason: string | null }[]
  location?: string | null
  items?: {
    product_name: string
    variant_title: string | null
    sku: string
    available: number
    threshold: number
    alert: string
  }[]
  pedido?: Carga
}

const NOMBRE_MEDIO: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  stripe: 'Tarjeta en línea',
  store_credit: 'Saldo a favor',
}

/** Hora local de la sucursal. Ver el punto 3 del encabezado. */
function hora(iso: string | null | undefined, tz: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: tz ?? 'UTC',
    }).format(new Date(iso))
  } catch {
    // Una zona inválida no puede tumbar el correo: se cae a UTC y se avisa
    // en el propio texto en vez de dejar el evento fallando para siempre.
    return `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC`
  }
}

function envoltorio(contenido: string, store: CargaAviso['store']): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${FONDO};">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${FONDO};padding:24px 12px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;background:${PAPEL};border:1px solid ${LINEA};">
        ${contenido}
        <tr><td style="padding:28px 40px 36px 40px;border-top:1px solid ${LINEA};text-align:center;">
          <p style="margin:0;font-family:${TEXTO};font-size:11px;line-height:1.7;color:${TENUE};">
            Aviso interno de ${esc(store?.name ?? 'LUMANE')}. Lo recibes porque esta dirección está puesta
            como correo de administración en Ajustes.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function cabecera(eyebrow: string, titulo: string, cifra?: string): string {
  return `
  <tr><td style="padding:40px 40px 0 40px;">
    <div style="font-family:${TEXTO};font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:${TENUE};">${esc(eyebrow)}</div>
    <h1 style="margin:10px 0 0 0;font-family:${DISPLAY};font-size:30px;line-height:1.15;font-weight:400;color:${TINTA};">${esc(titulo)}</h1>
    ${cifra ? `<div style="margin-top:8px;font-family:${TEXTO};font-size:28px;font-weight:600;color:${TINTA};">${esc(cifra)}</div>` : ''}
  </td></tr>`
}

function filas(pares: [string, string, boolean?][]): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation">${pares
    .map(
      ([k, v, fuerte]) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid ${LINEA};font-family:${TEXTO};font-size:14px;color:${fuerte ? TINTA : TENUE};${fuerte ? 'font-weight:600;' : ''}">${esc(k)}</td>
      <td style="padding:10px 0;border-bottom:1px solid ${LINEA};font-family:${TEXTO};font-size:14px;color:${TINTA};text-align:right;white-space:nowrap;${fuerte ? 'font-weight:600;' : ''}">${esc(v)}</td>
    </tr>`,
    )
    .join('')}</table>`
}

function bloque(titulo: string, contenido: string): string {
  return `
  <tr><td style="padding:28px 40px 0 40px;">
    <div style="font-family:${TEXTO};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${TENUE};margin-bottom:6px;">${esc(titulo)}</div>
    ${contenido}
  </td></tr>`
}

// ---------------------------------------------------------------------------
// Corte del día
// ---------------------------------------------------------------------------

function corteDelDia(c: CargaAviso): Correo | null {
  const s = c.session
  if (!s) return null

  const tz = s.timezone
  const metodos = Object.entries(c.by_method ?? {})
  const ventas = c.sales ?? []
  const movimientos = c.cash_movements ?? []

  const totalVendido = ventas.reduce((acc, v) => acc + Number(v.total_cents ?? 0), 0)
  const diferencia = Number(s.difference_cents ?? 0)

  // La diferencia es lo primero que se busca en un corte, así que se dice con
  // palabras y no solo con un signo: «faltaron» y «sobraron» no se confunden
  // leyendo rápido, «-$40.00» sí.
  const textoDiferencia =
    diferencia === 0
      ? 'Cuadró exacto'
      : diferencia < 0
        ? `Faltaron ${pesos(Math.abs(diferencia))}`
        : `Sobraron ${pesos(diferencia)}`

  const contenido = `
    ${cabecera('Corte del día', s.location ?? 'Caja', pesos(totalVendido))}

    ${bloque(
      'La caja',
      filas([
        ['Se abrió', `${hora(s.opened_at, tz)}${s.opened_by ? ` · ${s.opened_by}` : ''}`],
        ['Se cerró', `${hora(s.closed_at, tz)}${s.closed_by ? ` · ${s.closed_by}` : ''}`],
        ['Fondo inicial', pesos(s.opening_float_cents)],
        ['Efectivo esperado', pesos(s.expected_cash_cents)],
        ['Efectivo contado', pesos(s.counted_cash_cents)],
        [textoDiferencia, diferencia === 0 ? '—' : pesos(Math.abs(diferencia)), true],
      ]),
    )}

    ${
      metodos.length > 0
        ? bloque(
            'Cómo se cobró',
            filas(
              metodos.map(([metodo, d]) => [
                `${NOMBRE_MEDIO[metodo] ?? metodo} · ${d.count} ${d.count === 1 ? 'cobro' : 'cobros'}`,
                pesos(d.amount_cents),
              ]),
            ),
          )
        : bloque('Cómo se cobró', `<p style="margin:0;font-family:${TEXTO};font-size:14px;color:${TENUE};">Sin cobros en este turno.</p>`)
    }

    ${
      movimientos.length > 0
        ? bloque(
            'Entradas y salidas de efectivo',
            filas(
              movimientos.map((m) => [
                `${m.direction === 'in' ? 'Entrada' : 'Salida'}${m.reason ? ` · ${m.reason}` : ''}`,
                `${m.direction === 'in' ? '+' : '−'}${pesos(m.amount_cents)}`,
              ]),
            ),
          )
        : ''
    }

    ${
      ventas.length > 0
        ? bloque(
            `Las ${ventas.length} ${ventas.length === 1 ? 'venta' : 'ventas'} del turno`,
            filas(
              ventas.map((v) => [
                `${v.number}${v.customer ? ` · ${v.customer}` : ''} · ${hora(v.placed_at, tz)}`,
                pesos(v.total_cents),
              ]),
            ),
          )
        : bloque('Ventas', `<p style="margin:0;font-family:${TEXTO};font-size:14px;color:${TENUE};">No se registró ninguna venta.</p>`)
    }

    ${
      s.notes
        ? bloque('Nota de la cajera', `<p style="margin:0;font-family:${TEXTO};font-size:14px;line-height:1.6;color:${TINTA};">${esc(s.notes)}</p>`)
        : ''
    }

    <tr><td style="height:16px;"></td></tr>`

  const texto = [
    `CORTE DEL DÍA · ${s.location ?? 'Caja'}`,
    `Vendido: ${pesos(totalVendido)} en ${ventas.length} ventas`,
    '',
    `Abierta:  ${hora(s.opened_at, tz)}${s.opened_by ? ` (${s.opened_by})` : ''}`,
    `Cerrada:  ${hora(s.closed_at, tz)}${s.closed_by ? ` (${s.closed_by})` : ''}`,
    `Fondo inicial:     ${pesos(s.opening_float_cents)}`,
    `Efectivo esperado: ${pesos(s.expected_cash_cents)}`,
    `Efectivo contado:  ${pesos(s.counted_cash_cents)}`,
    textoDiferencia,
    '',
    'Cómo se cobró:',
    ...(metodos.length > 0
      ? metodos.map(([m, d]) => `  ${NOMBRE_MEDIO[m] ?? m}: ${pesos(d.amount_cents)} (${d.count})`)
      : ['  sin cobros']),
    '',
    'Ventas:',
    ...(ventas.length > 0
      ? ventas.map((v) => `  ${v.number}  ${hora(v.placed_at, tz)}  ${pesos(v.total_cents)}`)
      : ['  ninguna']),
    ...(s.notes ? ['', `Nota: ${s.notes}`] : []),
  ].join('\n')

  return {
    asunto: `Corte del día · ${pesos(totalVendido)} · ${ventas.length} ${ventas.length === 1 ? 'venta' : 'ventas'}`,
    html: envoltorio(contenido, c.store),
    texto,
  }
}

// ---------------------------------------------------------------------------
// Inventario
// ---------------------------------------------------------------------------

function inventario(c: CargaAviso): Correo | null {
  const items = c.items ?? []
  if (items.length === 0) return null

  const agotadas = items.filter((i) => i.alert === 'out')
  const bajas = items.filter((i) => i.alert !== 'out')

  const lista = (xs: typeof items) =>
    filas(
      xs.map((i) => [
        `${i.product_name}${i.variant_title ? ` · ${i.variant_title}` : ''} · ${i.sku}`,
        i.available <= 0 ? 'Agotada' : `Quedan ${i.available} (mínimo ${i.threshold})`,
      ]),
    )

  // El asunto prioriza lo agotado: es lo único que hace perder una venta hoy.
  const asunto =
    agotadas.length > 0
      ? `${agotadas.length} ${agotadas.length === 1 ? 'pieza agotada' : 'piezas agotadas'}${bajas.length > 0 ? ` y ${bajas.length} por agotarse` : ''}`
      : `${bajas.length} ${bajas.length === 1 ? 'pieza por agotarse' : 'piezas por agotarse'}`

  const contenido = `
    ${cabecera('Inventario', c.location ?? 'Boutique', asunto)}

    <tr><td style="padding:16px 40px 0 40px;">
      <p style="margin:0;font-family:${TEXTO};font-size:14px;line-height:1.6;color:${TENUE};">
        Este aviso solo se manda cuando la lista cambia, no todos los días.
      </p>
    </td></tr>

    ${agotadas.length > 0 ? bloque('Agotadas', lista(agotadas)) : ''}
    ${bajas.length > 0 ? bloque('Por agotarse', lista(bajas)) : ''}

    <tr><td style="height:16px;"></td></tr>`

  const texto = [
    `INVENTARIO · ${c.location ?? 'Boutique'}`,
    asunto,
    '',
    ...(agotadas.length > 0
      ? ['AGOTADAS:', ...agotadas.map((i) => `  ${i.product_name} ${i.variant_title ?? ''} (${i.sku})`)]
      : []),
    ...(bajas.length > 0
      ? ['', 'POR AGOTARSE:', ...bajas.map((i) => `  ${i.product_name} ${i.variant_title ?? ''} (${i.sku}): quedan ${i.available}, mínimo ${i.threshold}`)]
      : []),
  ].join('\n')

  return { asunto: `Inventario · ${asunto}`, html: envoltorio(contenido, c.store), texto }
}

// ---------------------------------------------------------------------------
// Venta en línea
// ---------------------------------------------------------------------------

function ventaEnLinea(c: CargaAviso): Correo | null {
  const p = c.pedido
  if (!p) return null

  const clienta = [p.customer?.first_name, p.customer?.last_name].filter(Boolean).join(' ').trim()
  const envio = p.order.shipping_address as Record<string, unknown> | null

  const contenido = `
    ${cabecera('Venta en línea', `Pedido ${p.order.number}`, pesos(p.order.total_cents))}

    ${bloque(
      'Quién compró',
      filas([
        ['Nombre', clienta || 'Sin nombre'],
        ['Correo', p.customer?.email ?? '—'],
        ...(envio
          ? ([
              ['Ciudad', String(envio.city ?? '—')],
              ['Estado', String(envio.state ?? '—')],
            ] as [string, string][])
          : []),
      ]),
    )}

    ${bloque(
      'Qué se llevó',
      filas(
        p.lines.map((l) => [
          `${l.product_name}${l.variant_title ? ` · ${l.variant_title}` : ''} × ${l.quantity}`,
          pesos(l.total_cents),
        ]),
      ),
    )}

    ${bloque(
      'Importe',
      filas([
        ['Subtotal', pesos(p.order.subtotal_cents)],
        ...(Number(p.order.discount_cents ?? 0) > 0
          ? ([['Descuento', `− ${pesos(p.order.discount_cents)}`]] as [string, string][])
          : []),
        ['Envío', pesos(p.order.shipping_cents)],
        ['Total', pesos(p.order.total_cents), true],
        ['IVA incluido', pesos(p.order.tax_cents)],
      ]),
    )}

    <tr><td style="padding:28px 40px 0 40px;">
      <p style="margin:0;font-family:${TEXTO};font-size:13px;line-height:1.6;color:${TENUE};">
        El pedido ya está en la bandeja de la tablet, en Pedidos.
      </p>
    </td></tr>

    <tr><td style="height:24px;"></td></tr>`

  const texto = [
    `VENTA EN LÍNEA · ${p.order.number}`,
    `Total: ${pesos(p.order.total_cents)}`,
    '',
    `Clienta: ${clienta || 'Sin nombre'} <${p.customer?.email ?? 'sin correo'}>`,
    ...(envio ? [`Envío a: ${String(envio.city ?? '')}, ${String(envio.state ?? '')}`] : []),
    '',
    'Piezas:',
    ...p.lines.map((l) => `  ${l.product_name}${l.variant_title ? ` (${l.variant_title})` : ''} x${l.quantity}  ${pesos(l.total_cents)}`),
    '',
    'Atiéndelo desde la tablet, en Pedidos.',
  ].join('\n')

  return {
    asunto: `Venta en línea · ${pesos(p.order.total_cents)} · ${p.order.number}`,
    html: envoltorio(contenido, c.store),
    texto,
  }
}

/** Devuelve `null` si el tema no lleva aviso: el worker lo marcará omitido. */
export function plantillaAviso(topic: string, c: CargaAviso): Correo | null {
  switch (topic) {
    case 'admin.register_close':
      return corteDelDia(c)
    case 'admin.stock_alert':
      return inventario(c)
    case 'admin.online_sale':
      return ventaEnLinea(c)
    default:
      return null
  }
}
