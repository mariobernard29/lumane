import { cache } from 'react'

import { storageUrl } from '../images.ts'
import { readCartToken } from '../cart/session.ts'
import { createServerSupabase } from '../supabase/server.ts'

export interface CartLine {
  variantId: string
  productId: string
  productSlug: string
  productName: string
  variantTitle: string
  sku: string
  unitPriceCents: number
  compareAtPriceCents: number | null
  quantity: number
  lineTotalCents: number
  available: number
  imageUrl: string
}

export interface CartTotals {
  subtotalCents: number
  discountCents: number
  shippingCents: number
  taxCents: number
  taxRate: number
  totalCents: number
  coupon: {
    valid: boolean
    code?: string
    reason?: string
    discountCents?: number
    freeShipping?: boolean
    minSubtotalCents?: number
  }
  /** null = no se pidió envío; false = ese método no aplica a esta dirección. */
  shippingAvailable: boolean | null
}

export interface Cart {
  cartId: string
  token: string
  lines: CartLine[]
  itemCount: number
  totals: CartTotals
  /** Líneas cuya cantidad ya supera lo disponible. Bloquean el pago. */
  unavailable: CartLine[]
}

/** Forma cruda de `private.cart_lines_json`. */
interface RawLine {
  variant_id: string
  product_id: string
  product_slug: string
  product_name: string
  variant_title: string
  sku: string
  unit_price_cents: number
  compare_at_price_cents: number | null
  quantity: number
  line_total_cents: number
  available: number
  image_path: string | null
}

interface RawTotals {
  subtotal_cents: number
  discount_cents: number
  shipping_cents: number
  tax_cents: number
  tax_rate: number
  total_cents: number
  coupon: {
    valid: boolean
    code?: string
    reason?: string
    discount_cents?: number
    free_shipping?: boolean
    min_subtotal_cents?: number
  }
  shipping_available: boolean | null
}

function toLine(raw: RawLine): CartLine {
  return {
    variantId: raw.variant_id,
    productId: raw.product_id,
    productSlug: raw.product_slug,
    productName: raw.product_name,
    variantTitle: raw.variant_title,
    sku: raw.sku,
    unitPriceCents: raw.unit_price_cents,
    compareAtPriceCents: raw.compare_at_price_cents,
    quantity: raw.quantity,
    lineTotalCents: raw.line_total_cents,
    available: raw.available,
    imageUrl: storageUrl(raw.image_path),
  }
}

export function toTotals(raw: RawTotals): CartTotals {
  return {
    subtotalCents: raw.subtotal_cents,
    discountCents: raw.discount_cents,
    shippingCents: raw.shipping_cents,
    taxCents: raw.tax_cents,
    taxRate: Number(raw.tax_rate),
    totalCents: raw.total_cents,
    coupon: {
      valid: raw.coupon?.valid ?? false,
      code: raw.coupon?.code,
      reason: raw.coupon?.reason,
      discountCents: raw.coupon?.discount_cents,
      freeShipping: raw.coupon?.free_shipping,
      minSubtotalCents: raw.coupon?.min_subtotal_cents,
    },
    shippingAvailable: raw.shipping_available,
  }
}

/**
 * La bolsa, con precios y disponibilidad frescos de la base.
 *
 * Devuelve null si aún no hay carrito: la página muestra su estado vacío sin
 * crear una fila por cada visita que solo pasa a mirar.
 */
export const getCart = cache(async (): Promise<Cart | null> => {
  const token = await readCartToken()
  if (!token) return null

  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('get_cart', { p_token: token })

  if (error) {
    console.error('[carrito] get_cart falló:', error.message)
    return null
  }
  if (!data) return null

  const raw = data as unknown as {
    cart_id: string
    token: string
    lines: RawLine[]
    item_count: number
    totals: RawTotals
  }

  const lines = (raw.lines ?? []).map(toLine)

  return {
    cartId: raw.cart_id,
    token: raw.token,
    lines,
    itemCount: raw.item_count ?? 0,
    totals: toTotals(raw.totals),
    unavailable: lines.filter((l) => l.quantity > l.available),
  }
})
