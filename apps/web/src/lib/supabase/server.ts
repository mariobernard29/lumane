import { createServerClient } from '@supabase/ssr'
import type { Database } from '@lumane/db'
import { cookies } from 'next/headers'

/**
 * Cliente de Supabase para el servidor de Next.js.
 *
 * Usa la llave PUBLICABLE y la sesión que viaja en las cookies, así que TODA
 * consulta pasa por RLS. Es lo correcto para el escaparate y para el área de
 * clienta: si una política está mal, la petición devuelve vacío en lugar de
 * filtrar datos ajenos.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Los Server Components no pueden escribir cookies. El middleware
            // ya refresca la sesión antes de llegar aquí, así que ignorarlo es
            // el comportamiento esperado, no un fallo silenciado.
          }
        },
      },
    },
  )
}

/**
 * Cliente con la llave SECRETA: salta RLS por completo.
 *
 * Reservado para lo que no puede depender de una sesión: el webhook de Stripe
 * confirmando un pedido y el worker de correos. NUNCA se usa para responder a
 * una petición del navegador — si aparece en una página, es un error.
 */
export function createAdminSupabase() {
  const key = process.env.SUPABASE_SECRET_KEY
  if (!key) {
    throw new Error(
      'Falta SUPABASE_SECRET_KEY. Necesaria para el webhook de Stripe y el envío de correos.',
    )
  }

  return createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    cookies: { getAll: () => [], setAll: () => {} },
  })
}
