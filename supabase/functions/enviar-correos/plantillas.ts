/**
 * Las plantillas de correo de Lumane.
 *
 * Monocromas, como la identidad: el prototipo neutraliza el acento a negro a
 * propósito y un correo con color de marca inventado rompería esa decisión.
 *
 * Todo va en tablas y con estilos en línea. No es nostalgia: Gmail borra las
 * hojas de estilo `<style>` en algunos clientes, Outlook ignora flexbox y
 * grid, y un correo que se ve roto en el cliente de la clienta no tiene
 * arreglo a posteriori — ya se mandó.
 */

const TINTA = '#0A0A0A'
const PAPEL = '#FFFFFF'
const FONDO = '#F9F9F9'
const LINEA = '#E2E2E2'
const TENUE = '#6B6B68'
const DISPLAY = "'Instrument Serif', Georgia, serif"
const TEXTO = "'Figtree', 'Helvetica Neue', Arial, sans-serif"

export interface Linea {
  product_name: string
  variant_title: string | null
  sku: string | null
  quantity: number
  unit_price_cents: number
  total_cents: number
}

export interface Pedido {
  id: string
  number: string
  status: string
  payment_status: string
  channel: string
  placed_at: string | null
  currency: string
  subtotal_cents: number
  discount_cents: number
  shipping_cents: number
  tax_cents: number
  total_cents: number
  shipping_address: Record<string, unknown> | null
  shipping_method: Record<string, unknown> | null
  note: string | null
}

export interface Carga {
  order: Pedido
  customer: { first_name: string | null; last_name: string | null; email: string | null } | null
  lines: Linea[]
  shipment: {
    carrier: string | null
    tracking_number: string | null
    tracking_url: string | null
    shipped_at: string | null
  } | null
  store: {
    name: string | null
    contact_email: string | null
    contact_phone: string | null
    whatsapp: string | null
    hours: string | null
    copyright: string | null
  } | null
}

export interface Correo {
  asunto: string
  html: string
  texto: string
}

/** Los centavos son `bigint` en la base y llegan como número o cadena. */
export function pesos(centavos: number | string | null | undefined): string {
  const n = Number(centavos ?? 0) / 100
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(n)
}

/**
 * Escapar es obligatorio, no defensivo de más: el nombre del producto y la
 * dirección los escribe una persona, y un apellido con `&` o unas comillas en
 * una referencia de entrega romperían el HTML del correo.
 */
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fecha(iso: string | null): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Mazatlan',
  }).format(new Date(iso))
}

function direccion(a: Record<string, unknown> | null): string {
  if (!a) return ''
  const partes = [
    [a.street, a.ext_no].filter(Boolean).join(' '),
    a.int_no ? `Int. ${a.int_no}` : '',
    a.neighborhood,
    [a.postal_code, a.city].filter(Boolean).join(' '),
    a.state,
  ]
  return partes.filter((p) => p && String(p).trim()).map(String).join(', ')
}

// ---------------------------------------------------------------------------
// Piezas compartidas
// ---------------------------------------------------------------------------

function cabecera(titulo: string, entradilla: string): string {
  return `
  <tr><td style="padding:48px 40px 8px 40px;text-align:center;">
    <div style="font-family:${TEXTO};font-size:13px;letter-spacing:0.28em;text-transform:uppercase;color:${TINTA};font-weight:500;">LUMANE</div>
  </td></tr>
  <tr><td style="padding:24px 40px 0 40px;text-align:center;">
    <h1 style="margin:0;font-family:${DISPLAY};font-size:34px;line-height:1.15;font-weight:400;color:${TINTA};">${esc(titulo)}</h1>
    <p style="margin:12px 0 0 0;font-family:${TEXTO};font-size:15px;line-height:1.6;color:${TENUE};">${esc(entradilla)}</p>
  </td></tr>`
}

function tablaLineas(lineas: Linea[]): string {
  const filas = lineas
    .map(
      (l) => `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid ${LINEA};font-family:${TEXTO};font-size:14px;color:${TINTA};">
        ${esc(l.product_name)}
        ${l.variant_title ? `<span style="color:${TENUE};"> · ${esc(l.variant_title)}</span>` : ''}
        <span style="color:${TENUE};"> × ${esc(l.quantity)}</span>
      </td>
      <td style="padding:14px 0;border-bottom:1px solid ${LINEA};font-family:${TEXTO};font-size:14px;color:${TINTA};text-align:right;white-space:nowrap;">
        ${esc(pesos(l.total_cents))}
      </td>
    </tr>`,
    )
    .join('')

  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation">${filas}</table>`
}

function totales(o: Pedido): string {
  const fila = (etiqueta: string, valor: string, fuerte = false) => `
    <tr>
      <td style="padding:6px 0;font-family:${TEXTO};font-size:${fuerte ? '16px' : '14px'};color:${fuerte ? TINTA : TENUE};${fuerte ? 'font-weight:600;' : ''}">${esc(etiqueta)}</td>
      <td style="padding:6px 0;font-family:${TEXTO};font-size:${fuerte ? '16px' : '14px'};color:${fuerte ? TINTA : TENUE};${fuerte ? 'font-weight:600;' : ''}text-align:right;white-space:nowrap;">${esc(valor)}</td>
    </tr>`

  const descuento = Number(o.discount_cents ?? 0)
  const envio = Number(o.shipping_cents ?? 0)

  return `
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:18px;">
    ${fila('Subtotal', pesos(o.subtotal_cents))}
    ${descuento > 0 ? fila('Descuento', `− ${pesos(descuento)}`) : ''}
    ${fila('Envío', envio > 0 ? pesos(envio) : 'Sin costo')}
    <tr><td colspan="2" style="padding-top:10px;border-top:1px solid ${LINEA};"></td></tr>
    ${fila('Total', pesos(o.total_cents), true)}
    <tr><td colspan="2" style="padding-top:2px;font-family:${TEXTO};font-size:12px;color:${TENUE};">IVA incluido: ${esc(pesos(o.tax_cents))}</td></tr>
  </table>`
}

function pie(store: Carga['store']): string {
  const correo = store?.contact_email ?? 'contacto@lumane.mx'
  const wa = store?.whatsapp
  return `
  <tr><td style="padding:36px 40px 44px 40px;border-top:1px solid ${LINEA};text-align:center;">
    <p style="margin:0 0 6px 0;font-family:${TEXTO};font-size:13px;line-height:1.7;color:${TENUE};">
      ¿Alguna duda? Contéstanos a este correo o escríbenos a
      <a href="mailto:${esc(correo)}" style="color:${TINTA};text-decoration:underline;">${esc(correo)}</a>${
        wa ? ` · WhatsApp <a href="https://wa.me/${esc(String(wa).replace(/\D/g, ''))}" style="color:${TINTA};text-decoration:underline;">${esc(wa)}</a>` : ''
      }.
    </p>
    ${store?.hours ? `<p style="margin:0 0 10px 0;font-family:${TEXTO};font-size:12px;color:${TENUE};">${esc(store.hours)}</p>` : ''}
    <p style="margin:0;font-family:${TEXTO};font-size:11px;color:${TENUE};">${esc(store?.copyright ?? '© LUMANE')}</p>
  </td></tr>`
}

function envoltorio(contenido: string, store: Carga['store']): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${FONDO};">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${FONDO};padding:24px 12px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;background:${PAPEL};border:1px solid ${LINEA};">
        ${contenido}
        ${pie(store)}
      </table>
    </td></tr>
  </table>
</body></html>`
}

/** La versión en texto plano no es un extra: sin ella los filtros puntúan peor. */
function aTexto(titulo: string, entradilla: string, c: Carga): string {
  const l = c.lines
    .map((x) => `- ${x.product_name}${x.variant_title ? ` (${x.variant_title})` : ''} x${x.quantity}  ${pesos(x.total_cents)}`)
    .join('\n')
  return [
    'LUMANE',
    '',
    titulo,
    entradilla,
    '',
    `Pedido ${c.order.number}`,
    l,
    '',
    `Subtotal: ${pesos(c.order.subtotal_cents)}`,
    `Envío: ${Number(c.order.shipping_cents ?? 0) > 0 ? pesos(c.order.shipping_cents) : 'Sin costo'}`,
    `Total: ${pesos(c.order.total_cents)} (IVA incluido: ${pesos(c.order.tax_cents)})`,
    '',
    `Dudas: ${c.store?.contact_email ?? 'contacto@lumane.mx'}`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Las plantillas
// ---------------------------------------------------------------------------

function bloqueEntrega(c: Carga): string {
  const dir = direccion(c.order.shipping_address)
  const metodo = c.order.shipping_method as Record<string, unknown> | null
  if (!dir && !metodo) return ''
  return `
  <tr><td style="padding:8px 40px 0 40px;">
    <div style="padding:16px;background:${FONDO};border:1px solid ${LINEA};">
      <div style="font-family:${TEXTO};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${TENUE};margin-bottom:6px;">Entrega</div>
      ${metodo?.name ? `<div style="font-family:${TEXTO};font-size:14px;color:${TINTA};">${esc(metodo.name)}</div>` : ''}
      ${dir ? `<div style="font-family:${TEXTO};font-size:13px;line-height:1.6;color:${TENUE};margin-top:4px;">${esc(dir)}</div>` : ''}
    </div>
  </td></tr>`
}

function armar(titulo: string, entradilla: string, c: Carga, extra = ''): Correo {
  const contenido = `
    ${cabecera(titulo, entradilla)}
    <tr><td style="padding:28px 40px 0 40px;">
      <div style="font-family:${TEXTO};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${TENUE};">
        Pedido ${esc(c.order.number)}${c.order.placed_at ? ` · ${esc(fecha(c.order.placed_at))}` : ''}
      </div>
    </td></tr>
    ${extra}
    <tr><td style="padding:12px 40px 0 40px;">
      ${tablaLineas(c.lines)}
      ${totales(c.order)}
    </td></tr>
    ${bloqueEntrega(c)}
    <tr><td style="height:36px;"></td></tr>`

  return {
    asunto: '',
    html: envoltorio(contenido, c.store),
    texto: aTexto(titulo, entradilla, c),
  }
}

/**
 * Devuelve `null` cuando el evento no merece correo. Es una respuesta válida,
 * no un fallo: `packed` y `completed` son estados internos del mostrador y
 * avisar de ellos sería ruido que enseña a la clienta a ignorar los correos de
 * Lumane — justo lo contrario de lo que se busca.
 */
export function plantillaPara(topic: string, aEstado: string | null, c: Carga): Correo | null {
  const nombre = c.customer?.first_name?.trim() || 'Hola'
  const saludo = nombre === 'Hola' ? 'Hola' : `Hola, ${nombre}`

  if (topic === 'order.placed') {
    const correo = armar(
      'Tu pedido está confirmado',
      `${saludo}. Recibimos tu pedido y ya lo estamos preparando. Te escribimos otra vez en cuanto salga.`,
      c,
    )
    correo.asunto = `Pedido ${c.order.number} confirmado · LUMANE`
    return correo
  }

  if (topic !== 'order.status_changed') return null

  switch (aEstado) {
    case 'preparing': {
      const correo = armar(
        'Estamos preparando tu pedido',
        `${saludo}. Tus piezas ya están sobre la mesa. En cuanto salgan te mandamos el seguimiento.`,
        c,
      )
      correo.asunto = `Preparando tu pedido ${c.order.number} · LUMANE`
      return correo
    }

    case 'shipped': {
      const s = c.shipment
      const extra = s?.tracking_number
        ? `
        <tr><td style="padding:20px 40px 0 40px;">
          <div style="padding:16px;border:1px solid ${TINTA};">
            <div style="font-family:${TEXTO};font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${TENUE};margin-bottom:6px;">Seguimiento</div>
            <div style="font-family:${TEXTO};font-size:14px;color:${TINTA};">${esc(s.carrier ?? 'Paquetería')} · ${esc(s.tracking_number)}</div>
            ${
              s.tracking_url
                ? `<div style="margin-top:12px;"><a href="${esc(s.tracking_url)}" style="display:inline-block;padding:11px 22px;background:${TINTA};color:${PAPEL};font-family:${TEXTO};font-size:13px;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;">Rastrear envío</a></div>`
                : ''
            }
          </div>
        </td></tr>`
        : ''
      const correo = armar('Tu pedido va en camino', `${saludo}. Tu pedido salió de la boutique.`, c, extra)
      correo.asunto = `Tu pedido ${c.order.number} va en camino · LUMANE`
      return correo
    }

    case 'delivered': {
      const correo = armar(
        'Tu pedido fue entregado',
        `${saludo}. Esperamos que te encante. Si algo no quedó como esperabas, contéstanos a este correo.`,
        c,
      )
      correo.asunto = `Pedido ${c.order.number} entregado · LUMANE`
      return correo
    }

    case 'cancelled': {
      const correo = armar(
        'Tu pedido fue cancelado',
        `${saludo}. Cancelamos tu pedido. Si hubo un cargo, se reembolsa a la misma tarjeta en los próximos días hábiles.`,
        c,
      )
      correo.asunto = `Pedido ${c.order.number} cancelado · LUMANE`
      return correo
    }

    // 'packed' y 'completed' son estados internos del mostrador: no se avisa.
    default:
      return null
  }
}
