import { cache } from 'react'

import { createServerSupabase } from '../supabase/server.ts'

export interface ShippingMethod {
  id: string
  code: string
  name: string
  description: string | null
  kind: 'flat' | 'local_delivery' | 'pickup'
  priceCents: number
  freeOverCents: number | null
  minDays: number | null
  maxDays: number | null
}

export interface LocalDeliveryRate {
  minKm: number
  maxKm: number
  priceCents: number
}

/**
 * Métodos de envío activos, en el orden que fijó la boutique.
 *
 * Los precios NO están escritos en el código: cambiar el envío express de $219
 * a $199 es editar una fila desde el POS. Lo mismo con los rangos de la entrega
 * local.
 */
export const getShippingMethods = cache(async (): Promise<ShippingMethod[]> => {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('shipping_methods')
    .select('id, code, name, description, kind, price_cents, free_over_cents, min_days, max_days')
    .order('position')

  if (error) {
    console.error('[envios] no se pudieron leer los métodos:', error.message)
    return []
  }

  return (data ?? []).map((m) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    description: m.description,
    kind: m.kind,
    priceCents: m.price_cents,
    freeOverCents: m.free_over_cents,
    minDays: m.min_days,
    maxDays: m.max_days,
  }))
})

/** Tramos de kilómetros de la entrega local, para poder enseñarlos en el checkout. */
export const getLocalDeliveryRates = cache(async (): Promise<LocalDeliveryRate[]> => {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('local_delivery_rates')
    .select('min_km, max_km, price_cents, shipping_methods!inner(code)')
    .eq('shipping_methods.code', 'local')
    .order('min_km')

  return (data ?? []).map((r) => ({
    minKm: Number(r.min_km),
    maxKm: Number(r.max_km),
    priceCents: r.price_cents,
  }))
})

/** Sucursal desde la que sale la entrega local. */
export const getDefaultLocation = cache(async () => {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('locations')
    .select('id, name, address, lat, lng, timezone')
    .eq('is_default', true)
    .maybeSingle()
  return data
})
