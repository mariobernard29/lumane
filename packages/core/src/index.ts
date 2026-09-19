/**
 * `@lumane/core` — el dominio de Lumane, sin interfaz y sin red.
 *
 * Todo lo que hay aquí es una función pura sobre datos. Ni un `fetch`, ni un
 * componente, ni una dependencia de React o de Next: por eso lo pueden usar
 * igual la tienda en línea (Node y navegador) y el POS (Hermes, en la tablet).
 *
 * La frontera es deliberada. Lo TRANSACCIONAL —descontar inventario, consumir
 * un cupón, cerrar una caja— vive en Postgres, porque el POS no puede ejecutar
 * Server Actions y dos implementaciones acabarían divergiendo. Lo que vive
 * aquí es lo que ambos clientes necesitan calcular en local para pintar la
 * pantalla antes de preguntar: totales estimados, aritmética del cobro, y los
 * bytes del ticket.
 */
export {
  formatPrice,
  formatAmount,
  discountPercent,
  parseAmountToCents,
  extractTaxCents,
} from './money.ts'

export {
  addLine,
  setQuantity,
  removeLine,
  setLineDiscount,
  linesOverStock,
  lineTotalCents,
  previewTotals,
  type SaleLine,
  type SaleTotalsPreview,
} from './sale.ts'

export {
  summarizePayments,
  suggestPayment,
  cashShortcuts,
  type DraftPayment,
  type PaymentMethod,
  type PaymentSummary,
} from './payments.ts'

export { EscPosBuilder, wrapText, type Align, type PaperWidth } from './escpos.ts'

export {
  buildSaleTicket,
  type TicketData,
  type TicketLine,
  type TicketPayment,
} from './ticket.ts'
