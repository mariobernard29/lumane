import { cache } from 'react'

import { createServerSupabase } from '../supabase/server.ts'

export interface CurrentCustomer {
  id: string
  firstName: string
  lastName: string | null
  email: string | null
}

/**
 * La clienta con sesión iniciada, o null si es una visita.
 *
 * Se apoya en `getClaims()`, que valida la firma del JWT localmente en lugar
 * de ir a la red en cada render. La fila de `customers` se lee después con
 * RLS: la política `customers_self_read` garantiza que solo puede volver la
 * suya, aunque esta consulta se escribiera mal.
 */
export const getCurrentCustomer = cache(async (): Promise<CurrentCustomer | null> => {
  const supabase = await createServerSupabase()

  const { data: claims } = await supabase.auth.getClaims()
  if (!claims) return null

  const { data } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email')
    .maybeSingle()

  if (!data) return null

  return {
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    email: data.email,
  }
})
