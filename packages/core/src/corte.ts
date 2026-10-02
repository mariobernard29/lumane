/**
 * El corte de caja en papel.
 *
 * Es un documento interno: se firma, se grapa al sobre del efectivo y se
 * guarda. Por eso lleva una cabecera corta y las firmas al final. Las cifras
 * son las que congeló `close_register`: el papel no recalcula nada.
 *
 * Un corte parcial (turno aún abierto) dice en grande que NO cierra la caja,
 * para que nadie lo confunda con el del final del día.
 */
import { formatFechaHora, imprimirBandaReimpresion, imprimirCabecera, type TicketHeader } from './cabecera.ts'
import { EscPosBuilder } from './escpos.ts'
import { formatAmount } from './money.ts'
import { NOMBRE_MEDIO, truncate, type TicketOptions } from './ticket.ts'

export interface CorteMethod {
  method: string
  amountCents: number
  count: number
}

export interface CorteData {
  header: TicketHeader
  /** `true` mientras el turno sigue abierto: es una foto, no el cierre. */
  partial: boolean
  openedAt: Date
  openedByName: string | null
  /** Cierre del turno; en un parcial, el momento de la impresión. */
  closedAt: Date
  closedByName: string | null
  openingFloatCents: number
  salesCount: number
  salesTotalCents: number
  byMethod: CorteMethod[]
  cashInCents: number
  cashOutCents: number
  expectedCashCents: number
  /** `null` en un parcial: todavía nadie ha contado. */
  countedCashCents: number | null
  differenceCents: number | null
  notes: string | null
  reprintedAt: Date | null
}

export function buildCorteTicket(data: CorteData, options: TicketOptions = {}): Uint8Array {
  const t = new EscPosBuilder(options.width ?? 32, { corte: options.corte })
  const width = t.width

  t.init()
  imprimirCabecera(t, data.header, false)
  t.rule('=')

  t.align('center').bold(true).size('alto')
  t.line(data.partial ? 'CORTE PARCIAL' : 'CORTE DE CAJA')
  t.size(1).bold(false)
  if (data.partial) t.line('No cierra la caja')
  t.align('left')

  if (data.reprintedAt) imprimirBandaReimpresion(t, data.reprintedAt)

  t.rule('=')

  t.columns('APERTURA', formatFechaHora(data.openedAt))
  if (data.openedByName) t.columns('  Abrió', truncate(data.openedByName, width - 9))
  t.columns(data.partial ? 'IMPRESO' : 'CIERRE', formatFechaHora(data.closedAt))
  if (data.closedByName) t.columns(data.partial ? '  Por' : '  Cerró', truncate(data.closedByName, width - 9))

  t.rule()

  t.bold(true).line('VENTAS').bold(false)
  t.columns(`  ${data.salesCount} ${data.salesCount === 1 ? 'venta' : 'ventas'}`, formatAmount(data.salesTotalCents))

  t.rule()

  t.bold(true).line('POR MEDIO DE PAGO').bold(false)
  if (data.byMethod.length === 0) {
    t.line('  Sin movimientos')
  }
  for (const m of data.byMethod) {
    const nombre = NOMBRE_MEDIO[m.method] ?? m.method
    t.columns(`  ${nombre} (${m.count})`, formatAmount(m.amountCents))
  }

  t.rule()

  t.bold(true).line('EFECTIVO').bold(false)
  t.columns('  Fondo inicial', formatAmount(data.openingFloatCents))
  const efectivo = data.byMethod.find((m) => m.method === 'cash')
  t.columns('  Cobrado en efectivo', formatAmount(efectivo?.amountCents ?? 0))
  if (data.cashInCents > 0) t.columns('  Entradas', `+${formatAmount(data.cashInCents)}`)
  if (data.cashOutCents > 0) t.columns('  Salidas', `-${formatAmount(data.cashOutCents)}`)
  t.bold(true).columns('  Esperado en caja', formatAmount(data.expectedCashCents)).bold(false)

  if (data.countedCashCents != null) {
    t.columns('  Contado', formatAmount(data.countedCashCents))

    const dif = data.differenceCents ?? data.countedCashCents - data.expectedCashCents
    const etiqueta = dif < 0 ? 'FALTANTE' : dif > 0 ? 'SOBRANTE' : 'DIFERENCIA'
    const signo = dif < 0 ? '-' : dif > 0 ? '+' : ''
    t.bold(true).size('alto').columns(etiqueta, `${signo}${formatAmount(Math.abs(dif))}`).size(1).bold(false)
  }

  if (data.notes) {
    t.rule()
    t.font('B').wrap(`Notas: ${data.notes}`).font('A')
  }

  if (!data.partial) {
    // Dos firmas: quien contó y quien recibe el sobre.
    t.feed(3)
    t.align('center')
    t.line('_'.repeat(Math.min(24, width)))
    t.line('Cajera')
    t.feed(2)
    t.line('_'.repeat(Math.min(24, width)))
    t.line('Recibe')
    t.align('left')
  }

  return t.cut().build()
}
