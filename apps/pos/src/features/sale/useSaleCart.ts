import { useCallback, useMemo, useState } from 'react'
import {
  addLine,
  previewTotals,
  removeLine,
  setLineDiscount,
  setQuantity,
  type SaleLine,
} from '@lumane/core'

import type { VariantHit } from './useVariantSearch.ts'

/**
 * El carrito del mostrador.
 *
 * Toda la aritmética vive en `@lumane/core` —funciones puras que la tienda en
 * línea también podría usar—; este hook solo la conecta a React. Así las
 * reglas del carrito se pueden razonar y comprobar sin abrir la aplicación.
 *
 * El `clientUuid` se genera al crear el carrito, ANTES de cobrar, y viaja con
 * la venta. Es lo que impide cobrar dos veces cuando la tablet pierde el wifi
 * a mitad del cobro y reintenta: `pos_create_sale` tiene un índice único sobre
 * él y la segunda llamada devuelve la venta original en lugar de crear otra.
 */
export function useSaleCart(taxRate = 0.16) {
  const [lines, setLines] = useState<SaleLine[]>([])
  const [manualDiscountCents, setManualDiscountCents] = useState(0)
  const [couponCode, setCouponCode] = useState<string | null>(null)
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [clientUuid, setClientUuid] = useState(() => crearUuid())

  const add = useCallback((hit: VariantHit, quantity = 1) => {
    setLines((actuales) =>
      addLine(actuales, {
        variantId: hit.variant_id,
        productId: hit.product_id,
        productName: hit.product_name,
        variantTitle: hit.variant_title,
        sku: hit.sku,
        unitPriceCents: hit.price_cents,
        quantity,
        available: hit.available,
      }),
    )
  }, [])

  const setQty = useCallback((variantId: string, quantity: number) => {
    setLines((actuales) => setQuantity(actuales, variantId, quantity))
  }, [])

  const remove = useCallback((variantId: string) => {
    setLines((actuales) => removeLine(actuales, variantId))
  }, [])

  const discountLine = useCallback((variantId: string, cents: number) => {
    setLines((actuales) => setLineDiscount(actuales, variantId, cents))
  }, [])

  /**
   * Vacía el carrito y estrena `clientUuid`.
   *
   * Renovarlo es obligatorio, no cosmético: reutilizarlo haría que la venta
   * siguiente se tomara por un reintento de la anterior y devolviera el ticket
   * viejo sin cobrar nada.
   */
  const reset = useCallback(() => {
    setLines([])
    setManualDiscountCents(0)
    setCouponCode(null)
    setCustomerId(null)
    setNote('')
    setClientUuid(crearUuid())
  }, [])

  const totals = useMemo(
    () => previewTotals(lines, { manualDiscountCents, taxRate }),
    [lines, manualDiscountCents, taxRate],
  )

  /** El payload de `pos_create_sale`. Sin precios: los pone la base. */
  const buildPayload = useCallback(
    (payments: { method: string; amount_cents: number; tendered_cents?: number; reference?: string }[]) => ({
      client_uuid: clientUuid,
      customer_id: customerId,
      coupon_code: couponCode,
      manual_discount_cents: manualDiscountCents,
      note: note.trim() === '' ? null : note.trim(),
      lines: lines.map((l) => ({
        variant_id: l.variantId,
        quantity: l.quantity,
        discount_cents: l.discountCents,
      })),
      payments,
    }),
    [clientUuid, customerId, couponCode, manualDiscountCents, note, lines],
  )

  return {
    lines,
    totals,
    clientUuid,
    manualDiscountCents,
    couponCode,
    customerId,
    note,
    add,
    setQty,
    remove,
    discountLine,
    setManualDiscountCents,
    setCouponCode,
    setCustomerId,
    setNote,
    reset,
    buildPayload,
    isEmpty: lines.length === 0,
  }
}

/**
 * UUID v4 con `crypto.getRandomValues`.
 *
 * Hermes trae `crypto.getRandomValues` pero no `crypto.randomUUID`, así que se
 * compone a mano. Importa que sea aleatorio de verdad y no un contador: dos
 * tablets generando el mismo identificador harían que la segunda venta se
 * tomara por un reintento de la primera y no se cobrara.
 */
function crearUuid(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)

  bytes[6] = (bytes[6]! & 0x0f) | 0x40 // versión 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // variante RFC 4122

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
