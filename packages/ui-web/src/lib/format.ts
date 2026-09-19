/**
 * Formato para la tienda en línea.
 *
 * El dinero NO se formatea aquí: se reexporta de `@lumane/core`, donde lo
 * comparte con el POS. Un ticket que dijera "$ 12,500 MXN" y una confirmación
 * de pedido que dijera "$12500.00" serían la misma tienda hablando con dos
 * voces, y con dos implementaciones eso acaba pasando.
 */
export { formatPrice, discountPercent } from '@lumane/core'

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
 * `wa.me` solo admite dígitos: un número escrito como "+52 668 464 1810" abre
 * una página de error si se manda tal cual. Se limpia aquí y no en cada sitio
 * que lo use, porque el número se escribe para leerse y no para pegarse en una
 * URL.
 */
export function whatsappHref(number: string | null | undefined): string | null {
  if (!number) return null
  const digits = number.replace(/\D/g, '')
  return digits ? `https://wa.me/${digits}` : null
}
