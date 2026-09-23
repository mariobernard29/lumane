'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@lumane/db'

let client: ReturnType<typeof createBrowserClient<Database>> | undefined

/**
 * Cliente del navegador. Se usa para lo que necesita vivir en el cliente:
 * las suscripciones de Realtime que deshabilitan una talla en el momento en
 * que se vende la última pieza en mostrador.
 *
 * Las escrituras de NEGOCIO no pasan por aquí: van por Server Actions, que
 * recalculan precios y stock contra la base antes de tocar nada.
 *
 * La excepción es **subir una imagen a Storage** desde el panel. No tiene
 * precio ni stock que recalcular, y mandar cinco megas al servidor de Next
 * para que él los reenvíe a Storage es doble tránsito y un límite de cuerpo
 * que se topa. La autorización la hace la política de `storage.objects`, que
 * exige `inventory.write` o `cms.write` igual que cualquier otra escritura; lo
 * que se guarda en la base —la RUTA de la imagen— sí pasa por una Server
 * Action.
 */
export function createBrowserSupabase() {
  client ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
  return client
}
