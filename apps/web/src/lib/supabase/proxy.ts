import { createServerClient } from '@supabase/ssr'
import type { Database } from '@lumane/db'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refresco de la sesión en cada petición.
 *
 * Los tokens de Supabase caducan en una hora. Los Server Components NO pueden
 * escribir cookies, así que si el refresco dependiera de ellos, la sesión
 * moriría en silencio y la clienta se encontraría fuera de su cuenta a media
 * compra. El middleware sí puede, y es el único sitio donde esto funciona.
 *
 * `getClaims()` valida la firma del JWT en local; solo va a la red cuando el
 * token está por caducar y hay que renovarlo.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  const { data } = await supabase.auth.getClaims()

  // El área de clienta exige sesión. Se redirige con `redirect` en la URL para
  // devolverla exactamente a donde iba después de entrar.
  if (!data && request.nextUrl.pathname.startsWith('/cuenta')) {
    const url = request.nextUrl.clone()
    url.pathname = '/ingresar'
    url.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // Quien ya entró no tiene nada que hacer en el formulario de acceso.
  if (data && ['/ingresar', '/registro'].includes(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/cuenta'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}
