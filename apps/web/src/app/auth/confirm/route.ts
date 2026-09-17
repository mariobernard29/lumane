import { type EmailOtpType } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'

import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Destino de los enlaces que Supabase manda por correo: confirmación de cuenta
 * y restablecimiento de contraseña.
 *
 * El `token_hash` se canjea aquí, en el servidor, y la sesión queda en cookies
 * httpOnly. Nunca viaja en el fragmento de la URL, donde el historial del
 * navegador —o una extensión— podría leerlo.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next')

  if (!tokenHash || !type) {
    redirect('/ingresar?error=enlace-invalido')
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

  if (error) {
    // Los enlaces caducan; no es un fallo del sistema y no debe parecerlo.
    redirect('/ingresar?error=enlace-caducado')
  }

  // Solo rutas internas: ver `safeRedirect` en actions/auth.ts.
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/cuenta'
  redirect(target)
}
