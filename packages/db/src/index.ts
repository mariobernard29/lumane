/**
 * `@lumane/db` — contrato tipado con la base de datos.
 *
 * Este paquete NO decide cómo se autentica cada app: `apps/web` envuelve el
 * cliente con `@supabase/ssr` (cookies) y `apps/pos` con `expo-secure-store`.
 * Aquí vive solo lo que ambas comparten: los tipos generados y los alias que
 * hacen legible el resto del código.
 */
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

import type { Database } from './database.types.ts'

export type { Database } from './database.types.ts'
export type { Json } from './database.types.ts'

export type LumaneClient = SupabaseClient<Database>

type PublicSchema = Database['public']

/** Fila de una tabla o vista: `Row<'products'>`. */
export type Row<T extends keyof PublicSchema['Tables'] | keyof PublicSchema['Views']> =
  T extends keyof PublicSchema['Tables']
    ? PublicSchema['Tables'][T]['Row']
    : T extends keyof PublicSchema['Views']
      ? PublicSchema['Views'][T]['Row']
      : never

/** Payload de inserción: `Insert<'orders'>`. */
export type Insert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert']

/** Payload de actualización: `Update<'orders'>`. */
export type Update<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update']

/** Enum del esquema: `Enum<'order_status'>`. */
export type Enum<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T]

// Alias de dominio, para no arrastrar `Row<'...'>` por toda la aplicación.
export type Product = Row<'products'>
export type ProductVariant = Row<'product_variants'>
export type ProductImage = Row<'product_images'>
export type Collection = Row<'collections'>
export type Category = Row<'categories'>
export type Order = Row<'orders'>
export type OrderLine = Row<'order_lines'>
export type Payment = Row<'payments'>
export type Customer = Row<'customers'>
export type CustomerAddress = Row<'customer_addresses'>
export type ShippingMethod = Row<'shipping_methods'>
export type LocalDeliveryRate = Row<'local_delivery_rates'>
export type Coupon = Row<'coupons'>
export type RegisterSession = Row<'register_sessions'>
export type InventoryLevel = Row<'inventory_levels'>
export type StockAlert = Row<'v_stock_alerts'>
export type HeroSlide = Row<'hero_slides'>
export type Banner = Row<'banners'>
export type Page = Row<'pages'>
export type NavigationItem = Row<'navigation_items'>
export type StoreSettings = Row<'store_settings'>

export type OrderStatus = Enum<'order_status'>
export type PaymentStatus = Enum<'payment_status'>
export type PaymentMethod = Enum<'payment_method'>
export type OrderChannel = Enum<'order_channel'>
export type ShippingKind = Enum<'shipping_kind'>

/**
 * Cliente básico, sin manejo de sesión. Sirve para el POS y para scripts.
 * En `apps/web` NO se usa: ahí manda `@supabase/ssr`, que sincroniza la sesión
 * con las cookies de la petición.
 */
export function createClient(url: string, key: string): LumaneClient {
  return createSupabaseClient<Database>(url, key)
}

export * from './storage.ts'
export * from './errors.ts'
