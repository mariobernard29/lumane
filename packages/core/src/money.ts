/**
 * Dinero.
 *
 * Todo importe del sistema es un ENTERO DE CENTAVOS. Nunca un float: 0.1 + 0.2
 * no es 0.3 en coma flotante, y en una caja registradora ese error se acumula
 * hasta que el corte del día no cuadra por unos pesos que nadie sabe explicar.
 *
 * Este módulo vive en `@lumane/core` y no en la capa de interfaz porque el
 * mostrador y la tienda en línea tienen que escribir las cifras IGUAL. Un
 * ticket que dice "$ 1,200 MXN" y una confirmación de pedido que dice
 * "$1200.00" son la misma tienda hablando con dos voces.
 */

const NUMBER = new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const NUMBER_WITH_CENTS = new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * `formatPrice(1250000)` → `"$ 12,500 MXN"`.
 *
 * Los centavos se ocultan cuando son cero: la boutique vende en pesos redondos
 * y el prototipo nunca muestra `.00` en las tarjetas. En el ticket, el resumen
 * del pedido y el corte de caja sí se piden con `withCents`, porque ahí el
 * importe se compara contra dinero real.
 */
export function formatPrice(cents: number | null | undefined, withCents = false): string {
  if (cents == null) return ''
  const pesos = cents / 100
  const needsCents = withCents || cents % 100 !== 0
  const body = needsCents ? NUMBER_WITH_CENTS.format(pesos) : NUMBER.format(pesos)
  return `$ ${body} MXN`
}

/** Sin el `$` ni el `MXN`: para columnas de ticket, donde el ancho manda. */
export function formatAmount(cents: number, withCents = true): string {
  return (withCents ? NUMBER_WITH_CENTS : NUMBER).format(cents / 100)
}

/** Porcentaje de descuento entre el precio anterior y el vigente. */
export function discountPercent(priceCents: number, compareAtCents: number | null): number | null {
  if (!compareAtCents || compareAtCents <= priceCents) return null
  return Math.round(((compareAtCents - priceCents) / compareAtCents) * 100)
}

/**
 * Lee lo que la cajera teclea en el cobro y devuelve centavos.
 *
 * Acepta "500", "500.50", "1,200.00" y "$1,200". Devuelve `null` —no 0— si no
 * hay un número: un campo vacío y un cobro de cero pesos no son lo mismo, y
 * confundirlos dejaría "COBRAR" habilitado sobre la nada.
 *
 * El redondeo es al centavo más cercano. `Math.round` sobre el producto evita
 * que "19.99" se convierta en 1998 por el clásico 19.99 × 100 = 1998.9999.
 */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/[^0-9.,-]/g, '').replace(/,/g, '')
  if (cleaned === '' || cleaned === '.' || cleaned === '-') return null

  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null

  return Math.round(value * 100)
}

/**
 * IVA incluido: se EXTRAE del total, no se suma.
 *
 * El precio que se captura ya es el que paga la clienta. `total × tasa/(1+tasa)`
 * es la parte de ese importe que corresponde al impuesto. Sumarlo por encima
 * cobraría un 16% de más sobre un precio que ya lo llevaba dentro.
 *
 * Es el espejo exacto de `private.extract_tax_cents()` en Postgres. Aquí sirve
 * solo para pintar un estimado mientras se compone la venta; el importe que se
 * guarda siempre lo calcula la base.
 */
export function extractTaxCents(totalCents: number, rate: number): number {
  if (rate <= 0) return 0
  return Math.round((totalCents * rate) / (1 + rate))
}
