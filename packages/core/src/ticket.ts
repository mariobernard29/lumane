/**
 * El ticket de venta.
 *
 * Se arma a partir de lo que devuelve `get_pos_sale`, no de lo que tenía la
 * pantalla en memoria: lo impreso tiene que ser lo GUARDADO. Si la base ajustó
 * un precio o un cupón cambió el total, el papel dice lo que de verdad se
 * cobró.
 *
 * Diseñado para 58 mm (32 columnas): el cuerpo en fuente A, que se lee a la
 * distancia del mostrador; la letra pequeña en fuente B; el total en doble
 * alto, que destaca sin perder columnas.
 */
import { formatFechaHora, imprimirBandaReimpresion, imprimirCabecera, type TicketHeader } from './cabecera.ts'
import { EscPosBuilder, type Corte, type PaperWidth } from './escpos.ts'
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
  header: TicketHeader
  orderNumber: string
  placedAt: Date
  cashierName: string | null
  customerName: string | null
  lines: TicketLine[]
  subtotalCents: number
  discountCents: number
  taxCents: number
  totalCents: number
  taxRate: number
  payments: TicketPayment[]
  changeCents: number
  /** Agradecimiento y demás pie. Viene de `store_settings`, no del código. */
  footerLines: string[]
  /** Si es una copia, cuándo se sacó. `null` en el original. */
  reprintedAt: Date | null
}

export interface TicketOptions {
  width?: PaperWidth
  corte?: Corte
}

export const NOMBRE_MEDIO: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  store_credit: 'Saldo a favor',
  stripe: 'Tarjeta (en línea)',
}

/**
 * Los bytes del ticket, listos para mandar a la impresora.
 *
 * Se devuelve el búfer entero en lugar de ir escribiendo: así la misma
 * plantilla sirve para imprimir, para previsualizar en pantalla y para
 * comprobarse en una prueba sin impresora conectada.
 */
export function buildSaleTicket(data: TicketData, options: TicketOptions = {}): Uint8Array {
  const t = new EscPosBuilder(options.width ?? 32, { corte: options.corte })
  const width = t.width

  t.init()
  imprimirCabecera(t, data.header)
  t.rule('=')

  if (data.reprintedAt) {
    imprimirBandaReimpresion(t, data.reprintedAt)
    t.rule('=')
  }

  t.columns('TICKET', data.orderNumber)
  t.columns('FECHA', formatFechaHora(data.placedAt))
  if (data.cashierName) t.columns('ATENDIÓ', truncate(data.cashierName, width - 9))
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

  // El total en doble alto: es lo que la clienta busca con la vista.
  t.bold(true).size('alto').columns('TOTAL', `$${formatAmount(data.totalCents)}`).size(1).bold(false)

  // El IVA se informa como parte del total, nunca sumado: es lo que exige la
  // ley y lo que hace el motor de precios.
  t.font('B').line(`IVA ${(data.taxRate * 100).toFixed(0)}% incluido: ${formatAmount(data.taxCents)}`).font('A')

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

  if (data.footerLines.length > 0) {
    t.feed(1).align('center')
    for (const línea of data.footerLines) t.wrap(línea)
    t.align('left')
  }

  return t.cut().build()
}

function nombreDeLínea(línea: TicketLine): string {
  return línea.variantTitle ? `${línea.productName} - ${línea.variantTitle}` : línea.productName
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}.`
}
