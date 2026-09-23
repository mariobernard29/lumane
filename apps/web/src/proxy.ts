import type { NextRequest } from 'next/server'

import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  /**
   * Se excluyen los estáticos, las imágenes y los webhooks.
   *
   * El webhook de Stripe NO trae cookies de sesión y no debe pasar por aquí:
   * refrescar una sesión inexistente en cada aviso de pago es trabajo perdido,
   * y una redirección accidental haría que Stripe reintentara el cobro.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks|logo-lumane|icon-lumane|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)',
  ],
}
