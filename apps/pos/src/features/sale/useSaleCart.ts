import { useCallback, useMemo, useState } from 'react'
import { randomUUID } from 'expo-crypto'
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
  // La clienta de esta venta. Se guarda su nombre y su correo además del id:
  // el id es lo único que viaja al RPC, pero la hoja de cobro tiene que poder
  // pintar a quién se asoció, y la del ticket prellenar su correo.
  const [customer, setCustomer] = useState<{
    id: string
    nombre: string
    email: string | null
  } | null>(null)
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
    setCustomer(null)
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
      customer_id: customer?.id ?? null,
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
    [clientUuid, customer, couponCode, manualDiscountCents, note, lines],
  )

  return {
    lines,
    totals,
    clientUuid,
    manualDiscountCents,
    couponCode,
    customer,
    note,
    add,
    setQty,
    remove,
    discountLine,
    setManualDiscountCents,
    setCouponCode,
    setCustomer,
    setNote,
    reset,
    buildPayload,
    isEmpty: lines.length === 0,
  }
}

/**
 * UUID v4 para el `client_uuid` del carrito.
 *
 * Lo da `expo-crypto`, no el objeto `crypto` global: **ese global no existe en
 * React Native**. El runtime de Expo polirellena `TextDecoder`, `URL`,
 * `structuredClone` y `fetch`, pero no `crypto`, así que una versión anterior
 * de esta función reventaba con «Property 'crypto' doesn't exist» al montar la
 * pantalla de venta — justo después de iniciar sesión, y en una compilación de
 * producción eso se ve como una pantalla en gris sin más explicación.
 *
 * Tiene que ser aleatorio de verdad y no un contador: dos tablets generando el
 * mismo identificador harían que la segunda venta se tomara por un reintento
 * de la primera y no se cobrara.
 */
function crearUuid(): string {
  return randomUUID()
}
