/**
 * El cobro.
 *
 * Una venta puede pagarse con varios medios —"$500 en efectivo y el resto con
 * tarjeta"— y por eso `payments` es una tabla hija con varias filas, no una
 * columna del pedido. Este módulo es la aritmética de esa pantalla.
 */

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'store_credit'

export interface DraftPayment {
  method: PaymentMethod
  /** Lo que este medio aporta al total. */
  amountCents: number
  /** Solo en efectivo: con cuánto pagó. Puede ser mayor que `amountCents`. */
  tenderedCents?: number
  /** Autorización de la terminal, folio de la transferencia… */
  reference?: string
}

export interface PaymentSummary {
  /** Suma de los importes aplicados al total. */
  paidCents: number
  /** Lo que falta por cubrir. Cero cuando la venta se puede cerrar. */
  dueCents: number
  /** Cambio a devolver: solo lo genera el efectivo entregado de más. */
  changeCents: number
  /** Los pagos cubren el total exacto. */
  isSettled: boolean
}

export function summarizePayments(payments: DraftPayment[], totalCents: number): PaymentSummary {
  const paidCents = payments.reduce((sum, p) => sum + p.amountCents, 0)

  // El cambio sale SOLO del efectivo. Una terminal cobra el importe exacto: si
  // alguien teclea que entregaron de más con tarjeta, no hay billete que
  // devolver y contarlo abriría un agujero en el corte de caja.
  const changeCents = payments.reduce(
    (sum, p) =>
      p.method === 'cash' && p.tenderedCents != null
        ? sum + Math.max(0, p.tenderedCents - p.amountCents)
        : sum,
    0,
  )

  return {
    paidCents,
    dueCents: Math.max(0, totalCents - paidCents),
    changeCents,
    // Exacto, no "suficiente": `pos_create_sale` aborta si los pagos no suman
    // el total, así que dejar cobrar de más aquí sería prometer algo que la
    // base va a rechazar.
    isSettled: paidCents === totalCents,
  }
}

/**
 * El pago que propone la pantalla al elegir un medio: lo que falte por cubrir.
 *
 * En una venta de un solo medio —que son casi todas— esto deja el importe ya
 * puesto y la cajera solo confirma.
 */
export function suggestPayment(
  method: PaymentMethod,
  payments: DraftPayment[],
  totalCents: number,
): DraftPayment {
  const { dueCents } = summarizePayments(payments, totalCents)
  return { method, amountCents: dueCents }
}

/**
 * Los botones de billete del teclado de efectivo.
 *
 * No son una lista fija: se ofrecen las denominaciones que de verdad sirven
 * para pagar esta venta, más el importe exacto. Un botón de $200 en una venta
 * de $11,349 no lo pulsa nadie.
 */
const DENOMINACIONES = [20_000, 50_000, 100_000] as const

export function cashShortcuts(totalCents: number): number[] {
  const útiles = DENOMINACIONES.filter((d) => d >= totalCents)

  // Redondeo al siguiente billete grande: lo que suele traer quien paga una
  // compra de boutique en efectivo.
  const siguienteMil = Math.ceil(totalCents / 100_000) * 100_000

  const candidatos = [totalCents, ...útiles, siguienteMil]
  return [...new Set(candidatos)].filter((c) => c >= totalCents).sort((a, b) => a - b).slice(0, 4)
}
