import { cache } from 'react'

import { createServerSupabase } from '../supabase/server.ts'

/**
 * Quién está usando el panel.
 *
 * Es el mismo `get_my_staff_profile` que lee la tablet, con los mismos tipos:
 * el personal es el mismo, entre por donde entre. Devuelve `null` cuando quien
 * pregunta no es personal —una clienta con sesión en la tienda, por ejemplo—,
 * y eso no es un error sino la respuesta correcta.
 *
 * **Esto ESCONDE, no autoriza.** La autorización real la hace RLS en cada
 * escritura: aunque alguien llegara a `/admin` saltándose esta guarda, sus
 * `insert` y `update` los rechazaría la base por falta de `cms.write` o
 * `inventory.write`. La guarda existe para no enseñar un panel inútil, no para
 * proteger los datos.
 *
 * `cache()` lo memoriza por petición: el marco del panel y cada pantalla lo
 * piden por separado.
 */

export interface StaffProfile {
  id: string
  full_name: string
  role: { key: 'owner' | 'manager' | 'cashier'; name: string }
  permissions: string[]
  location: { id: string; code: string; name: string }
}

export const getStaffProfile = cache(async (): Promise<StaffProfile | null> => {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.rpc('get_my_staff_profile')

  if (error) {
    console.error('[admin] no se pudo leer el perfil de personal:', error.message)
    return null
  }
  return (data as unknown as StaffProfile | null) ?? null
})

/** El comodín `*` de la propietaria concede todo, igual que en el POS. */
export function puede(staff: StaffProfile | null, permiso: string): boolean {
  if (!staff) return false
  return staff.permissions.includes('*') || staff.permissions.includes(permiso)
}
