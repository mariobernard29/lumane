/**
 * El ticket de venta.
 *
 * Se arma a partir de lo que devuelve `get_pos_sale`, no de lo que tenía la
 * pantalla en memoria: lo impreso tiene que ser lo GUARDADO. Si la base ajustó
 * un precio o un cupón cambió el total, el papel dice lo que de verdad se
 * cobró.
 */
import { EscPosBuilder, type PaperWidth } from './escpos.ts'
import { formatAmount } from './money.ts'

export interface TicketLine {
  productName: string
  variantTitle: string | null
  sku: string
  quantity: number
  unitPriceCents: number
  discountCents: number
  totalCents: number
}

export interface TicketPayment {
  method: string
  amountCents: number
  tenderedCents: number | null
  changeCents: number | null
  reference: string | null
}

export interface TicketData {
  storeName: string
  locationName: string
  addressLines: string[]
  phone: string | null
  orderNumber: string
  placedAt: Date
  cashierName: string
  customerName: string | null
  lines: TicketLine[]
  subtotalCents: number
  discountCents: number
  taxCents: number
  totalCents: number
  taxRate: number
  payments: TicketPayment[]
  changeCents: number
  /** Pie legal y de cambios. Viene de `store_settings`, no del código. */
  footerLines: string[]
}

const NOMBRE_MEDIO: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  store_credit: 'Saldo a favor',
  stripe: 'Tarjeta (en linea)',
}

const FECHA = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Mazatlan',
})

/**
 * Los bytes del ticket, listos para mandar a la impresora.
 *
 * Se devuelve el búfer entero en lugar de ir escribiendo: así la misma
 * plantilla sirve para imprimir, para previsualizar en pantalla y para
 * comprobarse en una prueba sin impresora conectada.
 */
export function buildSaleTicket(data: TicketData, width: PaperWidth = 32): Uint8Array {
  const t = new EscPosBuilder(width)

  t.init().align('center').bold(true).size(2).line(data.storeName).size(1)

  t.bold(false).line(data.locationName)
  for (const línea of data.addressLines) t.wrap(línea)
  if (data.phone) t.line(`Tel ${data.phone}`)

  t.feed(1).rule()

  t.align('left')
  t.columns('TICKET', data.orderNumber)
  t.columns('FECHA', FECHA.format(data.placedAt))
  t.columns('ATENDIO', truncate(data.cashierName, width - 9))
  if (data.customerName) t.columns('CLIENTA', truncate(data.customerName, width - 9))

  t.rule()

  for (const línea of data.lines) {
    // El nombre completo va en su propia línea; debajo, la aritmética. Partir
    // el nombre en la misma línea del importe obligaría a recortarlo, y la
    // cajera necesita reconocer la prenda de un vistazo al revisar una
    // devolución tres semanas después.
    t.bold(true).wrap(nombreDeLínea(línea)).bold(false)

    const unidades = `${línea.quantity} x ${formatAmount(línea.unitPriceCents)}`
    t.columns(`  ${unidades}`, formatAmount(línea.totalCents + línea.discountCents))

    if (línea.discountCents > 0) {
      t.columns('  Descuento', `-${formatAmount(línea.discountCents)}`)
    }
  }

  t.rule()

  t.columns('Subtotal', formatAmount(data.subtotalCents))
  if (data.discountCents > 0) {
    t.columns('Descuentos', `-${formatAmount(data.discountCents)}`)
  }

  // El total en doble tamaño: es lo que la clienta busca con la vista.
  t.bold(true).size(2).columns('TOTAL', formatAmount(data.totalCents), width / 2).size(1).bold(false)

  // El IVA se informa como parte del total, nunca sumado: es lo que exige la
  // ley y lo que hace el motor de precios.
  t.line(`IVA ${(data.taxRate * 100).toFixed(0)}% incluido: ${formatAmount(data.taxCents)}`)

  t.rule()

  for (const pago of data.payments) {
    t.columns(NOMBRE_MEDIO[pago.method] ?? pago.method, formatAmount(pago.amountCents))
    if (pago.tenderedCents != null && pago.tenderedCents > pago.amountCents) {
      t.columns('  Recibido', formatAmount(pago.tenderedCents))
    }
    if (pago.reference) t.line(`  Ref ${truncate(pago.reference, width - 6)}`)
  }

  if (data.changeCents > 0) {
    t.bold(true).columns('CAMBIO', formatAmount(data.changeCents)).bold(false)
  }

  t.feed(1).align('center')
  for (const línea of data.footerLines) t.wrap(línea)

  return t.cut().build()
}

function nombreDeLínea(línea: TicketLine): string {
  return línea.variantTitle ? `${línea.productName} - ${línea.variantTitle}` : línea.productName
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}.`
}
