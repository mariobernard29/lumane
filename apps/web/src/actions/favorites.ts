'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createServerSupabase } from '@/lib/supabase/server'

export interface FavoriteResult {
  ok: boolean
  /** true = ahora está en la lista de deseos. */
  isFavorite?: boolean
  /** La visita no tiene cuenta: la interfaz debe invitarla a entrar, no fallar. */
  requiresAuth?: boolean
  message?: string
}

const schema = z.object({ productId: z.uuid() })

/**
 * Añade o quita una pieza de la lista de deseos.
 *
 * No lleva comprobación de propiedad porque no le hace falta: la política
 * `customer_favorites_self_all` obliga a que `customer_id` sea el de la sesión.
 * Aunque esta función mandara otro id, la base rechazaría la fila.
 */
export async function toggleFavorite(input: { productId: string }): Promise<FavoriteResult> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, message: 'Pieza inválida' }

  const supabase = await createServerSupabase()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims) {
    return { ok: false, requiresAuth: true, message: 'Inicia sesión para guardar tus favoritos' }
  }

  const { data: customer } = await supabase.from('customers').select('id').maybeSingle()
  if (!customer) {
    return { ok: false, requiresAuth: true, message: 'Inicia sesión para guardar tus favoritos' }
  }

  const { data: existing } = await supabase
    .from('customer_favorites')
    .select('product_id')
    .eq('product_id', parsed.data.productId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('customer_favorites')
      .delete()
      .eq('product_id', parsed.data.productId)
    if (error) return { ok: false, message: 'No se pudo quitar de favoritos' }
    revalidatePath('/cuenta')
    return { ok: true, isFavorite: false }
  }

  const { error } = await supabase
    .from('customer_favorites')
    .insert({ customer_id: customer.id, product_id: parsed.data.productId })

  if (error) return { ok: false, message: 'No se pudo guardar en favoritos' }
  revalidatePath('/cuenta')
  return { ok: true, isFavorite: true }
}
