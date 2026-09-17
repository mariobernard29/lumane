import { cache } from 'react'

import { storageUrl } from '../images.ts'
import { createServerSupabase } from '../supabase/server.ts'

export interface AccountProfile {
  id: string
  firstName: string
  lastName: string | null
  email: string | null
  phone: string | null
  birthday: string | null
  acceptsMarketing: boolean
  memberSince: string
}

export interface AccountOrder {
  orderNumber: string
  status: string
  paymentStatus: string
  totalCents: number
  placedAt: string | null
  items: number
  imageUrl: string
  guestToken: string | null
}

export interface AccountAddress {
  id: string
  label: string | null
  recipient: string
  street: string
  extNo: string | null
  intNo: string | null
  neighborhood: string | null
  city: string
  state: string
  postalCode: string
  phone: string | null
  deliveryNotes: string | null
  isDefault: boolean
}

export interface WishlistItem {
  productId: string
  slug: string
  name: string
  priceCents: number
  compareAtPriceCents: number | null
  imageUrl: string
  imageAlt: string
  available: number
}

export interface AccountStats {
  ordersCount: number
  totalSpentCents: number
  wishlistCount: number
}

/**
 * Perfil de la clienta en sesión.
 *
 * La lectura va por RLS (`customers_self_read`): aunque esta consulta no
 * filtrara por id, la base solo devolvería su propia fila.
 */
export const getAccountProfile = cache(async (): Promise<AccountProfile | null> => {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email, phone, birthday, accepts_marketing, created_at')
    .maybeSingle()

  if (!data) return null

  return {
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    email: data.email,
    phone: data.phone,
    birthday: data.birthday,
    acceptsMarketing: data.accepts_marketing,
    memberSince: data.created_at,
  }
})

/** Historial de pedidos. El RPC ya limita a los de la clienta en sesión. */
export const getAccountOrders = cache(async (): Promise<AccountOrder[]> => {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('get_my_orders', { p_limit: 20 })

  if (error) {
    console.error('[cuenta] get_my_orders falló:', error.message)
    return []
  }

  const raw = (data ?? []) as unknown as {
    order_number: string
    status: string
    payment_status: string
    total_cents: number
    placed_at: string | null
    items: number
    image_path: string | null
    guest_token: string | null
  }[]

  return raw.map((o) => ({
    orderNumber: o.order_number,
    status: o.status,
    paymentStatus: o.payment_status,
    totalCents: o.total_cents,
    placedAt: o.placed_at,
    items: o.items,
    imageUrl: storageUrl(o.image_path),
    guestToken: o.guest_token,
  }))
})

export const getAccountAddresses = cache(async (): Promise<AccountAddress[]> => {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('customer_addresses')
    .select('*')
    .order('is_default', { ascending: false })
    .order('created_at')

  return (data ?? []).map((a) => ({
    id: a.id,
    label: a.label,
    recipient: a.recipient,
    street: a.street,
    extNo: a.ext_no,
    intNo: a.int_no,
    neighborhood: a.neighborhood,
    city: a.city,
    state: a.state,
    postalCode: a.postal_code,
    phone: a.phone,
    deliveryNotes: a.delivery_notes,
    isDefault: a.is_default,
  }))
})

/**
 * Lista de deseos.
 *
 * Se muestra el precio y la disponibilidad ACTUALES, no los de cuando se
 * guardó: una lista que enseña un precio viejo termina en una discusión en el
 * mostrador.
 */
export const getWishlist = cache(async (): Promise<WishlistItem[]> => {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('customer_favorites')
    .select(
      `
      product_id,
      products!inner (
        slug, name, status, is_online,
        product_variants ( price_cents, compare_at_price_cents, is_active,
          inventory_levels ( available ) ),
        product_images ( storage_path, alt_text, position )
      )
    `,
    )
    .order('created_at', { ascending: false })

  type Row = {
    product_id: string
    products: {
      slug: string
      name: string
      status: string
      is_online: boolean
      product_variants: {
        price_cents: number
        compare_at_price_cents: number | null
        is_active: boolean
        inventory_levels: { available: number | null }[]
      }[]
      product_images: { storage_path: string; alt_text: string; position: number }[]
    }
  }

  return ((data ?? []) as unknown as Row[])
    // Una pieza archivada o retirada de la tienda deja de aparecer, en lugar
    // de enlazar a un 404.
    .filter((row) => row.products?.status === 'active' && row.products.is_online)
    .map((row) => {
      const active = row.products.product_variants.filter((v) => v.is_active)
      const cheapest = active.reduce(
        (min, v) => (min === null || v.price_cents < min.price_cents ? v : min),
        null as (typeof active)[number] | null,
      )
      const image = [...row.products.product_images].sort((a, b) => a.position - b.position)[0]

      return {
        productId: row.product_id,
        slug: row.products.slug,
        name: row.products.name,
        priceCents: cheapest?.price_cents ?? 0,
        compareAtPriceCents: cheapest?.compare_at_price_cents ?? null,
        imageUrl: storageUrl(image?.storage_path),
        imageAlt: image?.alt_text || row.products.name,
        available: active.reduce(
          (sum, v) => sum + v.inventory_levels.reduce((s, il) => s + (il.available ?? 0), 0),
          0,
        ),
      }
    })
    .filter((item) => item.priceCents > 0)
})

/** Los dos contadores del resumen, derivados de la vista. */
export const getAccountStats = cache(async (): Promise<AccountStats> => {
  const supabase = await createServerSupabase()

  const [stats, favorites] = await Promise.all([
    supabase.from('v_customer_stats').select('orders_count, total_spent_cents').maybeSingle(),
    supabase.from('customer_favorites').select('product_id', { count: 'exact', head: true }),
  ])

  return {
    ordersCount: stats.data?.orders_count ?? 0,
    totalSpentCents: stats.data?.total_spent_cents ?? 0,
    wishlistCount: favorites.count ?? 0,
  }
})
