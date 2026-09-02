import 'server-only'

import { cookies } from 'next/headers'

import { createServerSupabase } from '../supabase/server.ts'

/**
 * El carrito de una invitada se identifica con un token secreto guardado en
 * una cookie httpOnly. Ese token ES la credencial: quien lo tiene es dueño del
 * carrito. Por eso no puede leerlo JavaScript del navegador (`httpOnly`) ni
 * viajar por HTTP en producción (`secure`).
 *
 * `sameSite: 'lax'` permite que la clienta vuelva de la pasarela de pago con
 * su bolsa intacta; `strict` la vaciaría justo en el peor momento.
 */
export const CART_COOKIE = 'lumane_cart'

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
} as const

export async function readCartToken(): Promise<string | null> {
  const store = await cookies()
  return store.get(CART_COOKIE)?.value ?? null
}

export async function writeCartToken(token: string): Promise<void> {
  const store = await cookies()
  store.set(CART_COOKIE, token, COOKIE_OPTIONS)
}

export interface CartSummary {
  itemCount: number
  token: string | null
}

/**
 * Solo el contador del icono de la bolsa. La cabecera se pinta en cada página,
 * así que aquí NO se crea un carrito si aún no existe: una visita que solo
 * mira el escaparate no debe generar filas en la base.
 */
export async function readCartSummary(): Promise<CartSummary> {
  const token = await readCartToken()
  if (!token) return { itemCount: 0, token: null }

  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('get_cart', { p_token: token })
  if (error || !data) return { itemCount: 0, token }

  const cart = data as { item_count?: number; token?: string }
  return { itemCount: cart.item_count ?? 0, token: cart.token ?? token }
}
