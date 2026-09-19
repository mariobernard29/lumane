/**
 * El carrito del mostrador.
 *
 * Funciones puras sobre una lista de líneas: nada de estado, nada de red. Esto
 * hace que la pantalla de venta sea trivial de razonar —cada gesto de la
 * cajera es una función de (carrito, acción) a carrito— y que las reglas se
 * puedan comprobar sin abrir la aplicación.
 *
 * Lo que se calcula aquí es un ESTIMADO para pintar en pantalla. El importe
 * que se cobra lo recalcula `pos_create_sale` contra la base: la tablet manda
 * `variant_id`, `quantity` y `discount_cents`, nunca precios. Si alguien
 * manipulara el cliente, cobraría exactamente lo mismo.
 */

export interface SaleLine {
  variantId: string
  productId: string
  productName: string
  /** Talla, color… vacío si la pieza no tiene variantes. */
  variantTitle: string
  sku: string
  /** Precio unitario leído del catálogo al añadir. Solo para mostrar. */
  unitPriceCents: number
  quantity: number
  /** Descuento en centavos sobre el importe de ESTA línea. */
  discountCents: number
  /** Disponible en la sucursal al momento de añadir, para avisar de faltantes. */
  available: number
}

export interface SaleTotalsPreview {
  subtotalCents: number
  /** Descuentos de línea + descuento global. El cupón lo valida la base. */
  discountCents: number
  totalCents: number
  taxCents: number
  itemCount: number
}

/** Importe de una línea ya con su descuento aplicado. Nunca negativo. */
export function lineTotalCents(line: SaleLine): number {
  return Math.max(0, line.unitPriceCents * line.quantity - line.discountCents)
}

/**
 * Añade una pieza. Si ya está en el carrito, sube la cantidad en lugar de
 * abrir una segunda línea: la cajera que escanea dos veces el mismo código
 * espera "2", no dos renglones iguales que luego hay que sumar a ojo.
 */
export function addLine(lines: SaleLine[], line: Omit<SaleLine, 'discountCents'>): SaleLine[] {
  const existing = lines.find((l) => l.variantId === line.variantId)
  if (!existing) return [...lines, { ...line, discountCents: 0 }]

  return lines.map((l) =>
    l.variantId === line.variantId ? { ...l, quantity: l.quantity + line.quantity } : l,
  )
}

/**
 * Cambia la cantidad de una línea. A cero, la quita.
 *
 * NO se topa contra `available`. El stock lo hace cumplir la base con su
 * CHECK, y aquí sobrevendría bloquear a la cajera que tiene la prenda en la
 * mano y sabe que el inventario está mal: en el mostrador, la realidad física
 * gana. La pantalla avisa (`linesOverStock`), pero no impide.
 */
export function setQuantity(lines: SaleLine[], variantId: string, quantity: number): SaleLine[] {
  if (quantity <= 0) return lines.filter((l) => l.variantId !== variantId)

  return lines.map((l) => {
    if (l.variantId !== variantId) return l
    // Un descuento de línea calculado para 3 piezas no puede sobrevivir a que
    // la línea baje a 1: se recorta al nuevo importe en lugar de regalar.
    const maxDiscount = l.unitPriceCents * quantity
    return { ...l, quantity, discountCents: Math.min(l.discountCents, maxDiscount) }
  })
}

export function removeLine(lines: SaleLine[], variantId: string): SaleLine[] {
  return lines.filter((l) => l.variantId !== variantId)
}

/** Descuento sobre una línea, topado a su importe: una línea nunca es negativa. */
export function setLineDiscount(
  lines: SaleLine[],
  variantId: string,
  discountCents: number,
): SaleLine[] {
  return lines.map((l) =>
    l.variantId === variantId
      ? { ...l, discountCents: clamp(discountCents, 0, l.unitPriceCents * l.quantity) }
      : l,
  )
}

/** Las líneas cuya cantidad supera el disponible. La pantalla las marca. */
export function linesOverStock(lines: SaleLine[]): SaleLine[] {
  return lines.filter((l) => l.quantity > l.available)
}

/**
 * Totales estimados.
 *
 * El descuento global se topa al subtotal ya rebajado por los descuentos de
 * línea; el total no puede bajar de cero. `taxCents` se extrae del total,
 * porque los precios de Lumane YA llevan el IVA dentro.
 */
export function previewTotals(
  lines: SaleLine[],
  options: { manualDiscountCents?: number; taxRate?: number } = {},
): SaleTotalsPreview {
  const subtotalCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0)
  const lineDiscounts = lines.reduce((sum, l) => sum + Math.min(l.discountCents, l.unitPriceCents * l.quantity), 0)

  const afterLines = subtotalCents - lineDiscounts
  const manual = clamp(options.manualDiscountCents ?? 0, 0, afterLines)

  const totalCents = afterLines - manual
  const taxRate = options.taxRate ?? 0.16

  return {
    subtotalCents,
    discountCents: lineDiscounts + manual,
    totalCents,
    taxCents: taxRate > 0 ? Math.round((totalCents * taxRate) / (1 + taxRate)) : 0,
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
