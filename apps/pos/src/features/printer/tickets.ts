import {
  buildCorteTicket,
  buildSaleTicket,
  buildTestTicket,
  LOGO_TICKET,
  type CorteData,
  type TicketData,
  type TicketHeader,
  type TicketOptions,
} from '@lumane/core'

import { supabase } from '@/lib/supabase'
import { imprimir, preferencias } from './impresora.ts'

/**
 * De la base al papel: piden los datos, los adaptan a las plantillas de
 * `@lumane/core` y los mandan a la impresora.
 *
 * Todo se lee de la base en el momento de imprimir —nunca de lo que tenía la
 * pantalla—, así una reimpresión de hace un mes dice exactamente lo mismo que
 * el original.
 */

/** La Moon58W: 58 mm y corte manual con barra dentada. */
const PAPEL: TicketOptions = { width: 32, corte: 'manual' }

interface CabeceraBase {
  header: TicketHeader
  taxRate: number
  thanks: string | null
}

let cabecera: Promise<CabeceraBase> | null = null

/**
 * Los datos del negocio cambian muy de vez en cuando: se piden una vez y se
 * guardan en memoria. Si la petición falla, se olvida para reintentar en la
 * siguiente impresión.
 */
function obtenerCabecera(): Promise<CabeceraBase> {
  cabecera ??= (async () => {
    const { data, error } = await supabase.rpc('get_ticket_header')
    if (error) throw error
    return aCabecera(data as unknown as CabeceraRpc)
  })().catch((e: unknown) => {
    cabecera = null
    throw e
  })
  return cabecera
}

/** Para que un cambio en Admin › Ajustes se vea sin reiniciar la app. */
export function olvidarCabecera(): void {
  cabecera = null
}

// ---------------------------------------------------------------------------
// Venta
// ---------------------------------------------------------------------------

export async function imprimirVenta(orderId: string, opciones: { reimpresion: boolean }): Promise<void> {
  const [base, venta] = await Promise.all([
    obtenerCabecera(),
    supabase.rpc('get_pos_sale', { p_order_id: orderId }).then(({ data, error }) => {
      if (error) throw error
      if (!data) throw new Error('No se encontró la venta')
      return data as unknown as VentaRpc
    }),
  ])

  const bytes = buildSaleTicket(aTicketData(base, venta, opciones.reimpresion ? new Date() : null), PAPEL)
  // Las copias son para el ticket recién cobrado; una reimpresión es una sola.
  await imprimir(bytes, opciones.reimpresion ? 1 : preferencias().copias)
}

// ---------------------------------------------------------------------------
// Corte de caja
// ---------------------------------------------------------------------------

/**
 * `sessionId` null = el turno abierto ahora mismo, que sale como corte
 * PARCIAL. Con id, el corte cerrado de ese turno.
 */
export async function imprimirCorte(
  sessionId: string | null,
  opciones: { reimpresion: boolean },
): Promise<void> {
  const [base, corte] = await Promise.all([
    obtenerCabecera(),
    supabase.rpc('get_corte', sessionId ? { p_session_id: sessionId } : {}).then(({ data, error }) => {
      if (error) throw error
      return data as unknown as CorteRpc
    }),
  ])

  await imprimir(buildCorteTicket(aCorteData(base, corte, opciones.reimpresion ? new Date() : null), PAPEL))
}

// ---------------------------------------------------------------------------
// Prueba
// ---------------------------------------------------------------------------

export async function imprimirPrueba(): Promise<void> {
  // La prueba no debe depender de la red: si la cabecera no llega, sale con
  // el logo y sin datos de contacto, que es suficiente para calibrar.
  const header = await obtenerCabecera()
    .then((b) => b.header)
    .catch(
      (): TicketHeader => ({
        storeName: 'LUMANE',
        logo: LOGO_TICKET,
        locationName: '',
        addressLines: [],
        phone: null,
        whatsapp: null,
        socials: [],
        website: null,
      }),
    )
  await imprimir(buildTestTicket(header, PAPEL))
}

// ---------------------------------------------------------------------------
// Adaptadores
// ---------------------------------------------------------------------------

interface DireccionRpc {
  street?: string
  ext_no?: string
  int_no?: string | null
  neighborhood?: string
  postal_code?: string
  city?: string
  state?: string
}

interface CabeceraRpc {
  store_name: string
  contact_phone: string | null
  whatsapp_number: string | null
  social_links: { instagram?: string; facebook?: string; tiktok?: string } | null
  ticket_thanks: string | null
  tax_rate: number | string
  website: string | null
  location: { name: string; phone: string | null; address: DireccionRpc | null } | null
}

interface VentaRpc {
  order: {
    order_number: string
    placed_at: string | null
    created_at: string
    subtotal_cents: number
    discount_cents: number
    tax_cents: number
    total_cents: number
  }
  lines: {
    product_name: string
    variant_title: string | null
    sku: string
    quantity: number
    unit_price_cents: number
    discount_cents: number
    total_cents: number
  }[]
  payments: {
    method: string
    amount_cents: number
    tendered_cents: number | null
    change_cents: number | null
    reference: string | null
  }[]
  customer: { first_name: string; last_name: string | null } | null
  change_cents: number
  cashier_name: string | null
}

interface CorteRpc {
  session: {
    status: 'open' | 'closed'
    opened_at: string
    closed_at: string | null
    opening_float_cents: number
    counted_cash_cents: number | null
    difference_cents: number | null
    notes: string | null
  }
  expected_cash_cents: number
  by_method: Record<string, { amount_cents: number; count: number }>
  sales_count: number
  sales_total_cents: number
  cash_in_cents: number
  cash_out_cents: number
  opened_by_name: string | null
  closed_by_name: string | null
}

function aCabecera(r: CabeceraRpc): CabeceraBase {
  const local = r.location
  return {
    header: {
      storeName: r.store_name,
      logo: LOGO_TICKET,
      locationName: local?.name ?? '',
      addressLines: local?.address ? lineasDeDireccion(local.address) : [],
      phone: telefono(local?.phone ?? r.contact_phone),
      whatsapp: telefono(r.whatsapp_number),
      socials: redes(r.social_links ?? {}),
      website: r.website,
    },
    taxRate: Number(r.tax_rate),
    thanks: r.ticket_thanks?.trim() || null,
  }
}

function aTicketData(base: CabeceraBase, v: VentaRpc, reprintedAt: Date | null): TicketData {
  const o = v.order
  return {
    header: base.header,
    orderNumber: o.order_number,
    placedAt: new Date(o.placed_at ?? o.created_at),
    cashierName: v.cashier_name,
    customerName: v.customer
      ? [v.customer.first_name, v.customer.last_name].filter(Boolean).join(' ')
      : null,
    lines: v.lines.map((l) => ({
      productName: l.product_name,
      variantTitle: l.variant_title,
      sku: l.sku,
      quantity: l.quantity,
      unitPriceCents: l.unit_price_cents,
      discountCents: l.discount_cents,
      totalCents: l.total_cents,
    })),
    subtotalCents: o.subtotal_cents,
    discountCents: o.discount_cents,
    taxCents: o.tax_cents,
    totalCents: o.total_cents,
    taxRate: base.taxRate,
    payments: v.payments.map((p) => ({
      method: p.method,
      amountCents: p.amount_cents,
      tenderedCents: p.tendered_cents,
      changeCents: p.change_cents,
      reference: p.reference,
    })),
    changeCents: v.change_cents,
    footerLines: base.thanks ? [base.thanks] : [],
    reprintedAt,
  }
}

function aCorteData(base: CabeceraBase, c: CorteRpc, reprintedAt: Date | null): CorteData {
  const parcial = c.session.status === 'open'
  return {
    header: base.header,
    partial: parcial,
    openedAt: new Date(c.session.opened_at),
    openedByName: c.opened_by_name,
    closedAt: parcial || !c.session.closed_at ? new Date() : new Date(c.session.closed_at),
    closedByName: c.closed_by_name,
    openingFloatCents: c.session.opening_float_cents,
    salesCount: c.sales_count,
    salesTotalCents: c.sales_total_cents,
    byMethod: Object.entries(c.by_method ?? {}).map(([method, m]) => ({
      method,
      amountCents: m.amount_cents,
      count: m.count,
    })),
    cashInCents: c.cash_in_cents,
    cashOutCents: c.cash_out_cents,
    expectedCashCents: c.expected_cash_cents,
    countedCashCents: parcial ? null : c.session.counted_cash_cents,
    differenceCents: parcial ? null : c.session.difference_cents,
    notes: c.session.notes,
    reprintedAt,
  }
}

function lineasDeDireccion(d: DireccionRpc): string[] {
  const calle = [d.street, d.ext_no].filter(Boolean).join(' ')
  return [
    [calle, d.int_no].filter(Boolean).join(', '),
    [d.neighborhood, d.postal_code && `C.P. ${d.postal_code}`].filter(Boolean).join(', '),
    [d.city, d.state].filter(Boolean).join(', '),
  ].filter((l) => l !== '')
}

/** Sin el +52: en una tienda de Los Mochis, la lada de país solo gasta columnas. */
function telefono(t: string | null | undefined): string | null {
  const limpio = t?.trim().replace(/^\+52\s*/, '')
  return limpio || null
}

/**
 * Las redes se guardan como URL completa (Admin › Ajustes); en el papel va el
 * usuario, que es lo que la clienta teclea en la app.
 */
function redes(links: { instagram?: string; facebook?: string; tiktok?: string }): string[] {
  const usuario = (url: string) =>
    url
      .trim()
      .replace(/^https?:\/\/(www\.)?[^/]+\//i, '')
      .replace(/^@/, '')
      .split(/[/?#]/)[0] ?? ''

  const salida: string[] = []
  if (links.instagram) salida.push(`IG @${usuario(links.instagram)}`)
  if (links.facebook) salida.push(`FB /${usuario(links.facebook)}`)
  if (links.tiktok) salida.push(`TikTok @${usuario(links.tiktok)}`)
  return salida.filter((s) => !s.endsWith('@') && !s.endsWith('/'))
}
