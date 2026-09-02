'use server'

import { revalidatePath } from 'next/cache'
import { errorMessage } from '@lumane/db'
import { z } from 'zod'

import { readCartToken, writeCartToken } from '@/lib/cart/session'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Acciones del carrito.
 *
 * Todas delegan en los RPC de Postgres: aquí no se calcula ningún precio ni se
 * comprueba ningún stock. Esta capa solo traduce entre el formulario, la
 * cookie del carrito y la base.
 */

export interface CartActionResult {
  ok: boolean
  message?: string
  itemCount?: number
}

const addSchema = z.object({
  variantId: z.uuid('Falta elegir una talla'),
  quantity: z.coerce.number().int().min(1).max(20),
})

export async function addToCart(input: {
  variantId: string
  quantity: number
}): Promise<CartActionResult> {
  const parsed = addSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const supabase = await createServerSupabase()
  const token = await readCartToken()

  const { data, error } = await supabase.rpc('add_cart_line', {
    p_token: token ?? undefined,
    p_variant_id: parsed.data.variantId,
    p_quantity: parsed.data.quantity,
  })

  if (error) {
    // El RPC ya devuelve textos redactados para la clienta ("Solo quedan 2
    // piezas de esta talla"); `errorMessage` los prefiere sobre el genérico.
    return { ok: false, message: errorMessage(error) }
  }

  const cart = data as unknown as { token: string; item_count: number }

  // El RPC crea el carrito si el token no existía: hay que quedarse con el
  // nuevo, o la siguiente visita empezaría con la bolsa vacía.
  if (cart.token && cart.token !== token) {
    await writeCartToken(cart.token)
  }

  revalidatePath('/', 'layout')
  return { ok: true, itemCount: cart.item_count }
}

const quantitySchema = z.object({
  variantId: z.uuid(),
  quantity: z.coerce.number().int().min(0).max(20),
})

export async function setCartLineQuantity(input: {
  variantId: string
  quantity: number
}): Promise<CartActionResult> {
  const parsed = quantitySchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: 'Datos inválidos' }

  const token = await readCartToken()
  if (!token) return { ok: false, message: 'Tu bolsa está vacía' }

  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('set_cart_line_quantity', {
    p_token: token,
    p_variant_id: parsed.data.variantId,
    p_quantity: parsed.data.quantity,
  })

  if (error) return { ok: false, message: errorMessage(error) }

  revalidatePath('/', 'layout')
  return { ok: true, itemCount: (data as unknown as { item_count: number }).item_count }
}
