'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@lumane/db'

let client: ReturnType<typeof createBrowserClient<Database>> | undefined

/**
 * Cliente del navegador. Se usa para lo que necesita vivir en el cliente:
 * las suscripciones de Realtime que deshabilitan una talla en el momento en
 * que se vende la última pieza en mostrador.
 *
 * Las escrituras NO pasan por aquí: van por Server Actions, que recalculan
 * precios y stock contra la base antes de tocar nada.
 */
export function createBrowserSupabase() {
  client ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
  return client
}
