/**
 * Formato de moneda. El prototipo escribe SIEMPRE `$ 12,500 MXN`:
 * signo, espacio, miles con coma, y el código de divisa al final.
 * `Intl` por sí solo produce `$12,500.00`, así que se compone a mano para no
 * desviarse ni un carácter del diseño aprobado.
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
 * Los centavos se ocultan cuando son cero: la boutique vende en pesos
 * redondos y el prototipo nunca muestra `.00` en las tarjetas. En el ticket y
 * en el resumen del pedido sí se piden explícitamente con `withCents`.
 */
export function formatPrice(cents: number | null | undefined, withCents = false): string {
  if (cents == null) return ''
  const pesos = cents / 100
  const needsCents = withCents || cents % 100 !== 0
  const body = needsCents ? NUMBER_WITH_CENTS.format(pesos) : NUMBER.format(pesos)
  return `$ ${body} MXN`
}

/** Porcentaje de descuento entre el precio anterior y el vigente. */
export function discountPercent(priceCents: number, compareAtCents: number | null): number | null {
  if (!compareAtCents || compareAtCents <= priceCents) return null
  return Math.round(((compareAtCents - priceCents) / compareAtCents) * 100)
}

const DATE = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** `"14 de agosto de 2026"` — como en el historial de pedidos del prototipo. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return ''
  return DATE.format(typeof value === 'string' ? new Date(value) : value)
}

/**
 * Enlace a la conversación de WhatsApp de la boutique.
 *
 * `wa.me` solo admite dígitos: un número escrito como "668 123 4567" abre una
 * página de error. Se limpia aquí y no en cada sitio que lo use, porque el
 * número se escribe para leerse y no para pegarse en una URL.
 */
export function whatsappHref(number: string | null | undefined): string | null {
  if (!number) return null
  const digits = number.replace(/\D/g, '')
  return digits ? `https://wa.me/${digits}` : null
}
