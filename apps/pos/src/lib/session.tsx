import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'

import { recordarCuenta } from './cuentas.ts'
import { supabase } from './supabase.ts'

/**
 * Quién está usando la tablet.
 *
 * El perfil, los permisos, la sucursal y el turno de caja llegan en UNA
 * llamada (`get_my_staff_profile`). Tenerlos juntos evita la pantalla a medias
 * clásica: la venta pintada pero sin saber todavía si hay caja abierta.
 *
 * Los permisos sirven para ESCONDER lo que no se puede hacer, no para
 * autorizarlo. La autorización real la hace cada RPC contra la base. Un APK
 * modificado puede pintarse todos los botones y seguirá sin poder registrar
 * una devolución.
 */

export interface StaffRole {
  key: 'owner' | 'manager' | 'cashier'
  name: string
}

export interface StaffLocation {
  id: string
  code: string
  name: string
  address: Record<string, unknown> | null
  phone: string | null
}

export interface OpenRegisterSession {
  id: string
  opened_at: string
  opening_float_cents: number
  location_id: string
}

export interface StaffProfile {
  id: string
  full_name: string
  role: StaffRole
  permissions: string[]
  location: StaffLocation
  open_session: OpenRegisterSession | null
}

interface SessionState {
  /** `null` mientras se resuelve el arranque; luego la sesión o `false`. */
  session: Session | null
  staff: StaffProfile | null
  loading: boolean
  /** El correo entró bien pero la cuenta no es de personal. */
  notStaff: boolean
  signIn: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>
  signOut: () => Promise<void>
  /** Relee el perfil. Se llama al abrir o cerrar caja. */
  refresh: () => Promise<void>
  can: (permission: string) => boolean
}

const SessionContext = createContext<SessionState | null>(null)

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [staff, setStaff] = useState<StaffProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [notStaff, setNotStaff] = useState(false)

  const cargarPerfil = useCallback(async (activa: Session | null) => {
    if (!activa) {
      setStaff(null)
      setNotStaff(false)
      return
    }

    const { data, error } = await supabase.rpc('get_my_staff_profile')

    if (error) {
      // No se expulsa la sesión por un fallo de red: el token sigue siendo
      // válido y reintentar es mejor que obligar a teclear la contraseña otra
      // vez con la clienta esperando.
      console.error('[sesion] no se pudo leer el perfil:', error.message)
      return
    }

    const perfil = data as unknown as StaffProfile | null
    setStaff(perfil)
    // Una clienta con cuenta en la tienda en línea puede autenticarse, pero no
    // es personal. El RPC devuelve null y aquí se dice por qué.
    setNotStaff(perfil === null)

    // El desplegable de la pantalla de ingreso se llena AQUÍ y no en `signIn`:
    // solo se recuerda a quien resultó ser personal, y con el nombre que da la
    // base en vez del correo. No se espera al resultado porque nada de lo que
    // viene después depende de ello.
    if (perfil && activa.user.email) {
      void recordarCuenta(activa.user.email, perfil.full_name)
    }
  }, [])

  useEffect(() => {
    let vivo = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!vivo) return
      setSession(data.session)
      await cargarPerfil(data.session)
      if (vivo) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nueva) => {
      setSession(nueva)
      void cargarPerfil(nueva)
    })

    return () => {
      vivo = false
      sub.subscription.unsubscribe()
    }
  }, [cargarPerfil])

  const signIn = useCallback<SessionState['signIn']>(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    if (!error) return { ok: true }

    // Supabase responde lo mismo para correo inexistente y contraseña mala, a
    // propósito: decir cuál falló permitiría averiguar quién trabaja aquí.
    const message =
      error.message === 'Invalid login credentials'
        ? 'Correo o contraseña incorrectos'
        : error.message
    return { ok: false, message }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setStaff(null)
    setNotStaff(false)
  }, [])

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await cargarPerfil(data.session)
  }, [cargarPerfil])

  const can = useCallback(
    (permission: string) =>
      staff ? staff.permissions.includes('*') || staff.permissions.includes(permission) : false,
    [staff],
  )

  const value = useMemo<SessionState>(
    () => ({ session, staff, loading, notStaff, signIn, signOut, refresh, can }),
    [session, staff, loading, notStaff, signIn, signOut, refresh, can],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionState {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('useSession fuera de <SessionProvider>')
  }
  return context
}

/**
 * El personal ya autenticado. Lanza si no lo hay.
 *
 * Solo se usa dentro del grupo de rutas protegido, donde el layout ya ha
 * garantizado que existe: así las pantallas no arrastran un `staff?.` por cada
 * línea para un caso que no puede ocurrir.
 */
export function useStaff(): StaffProfile {
  const { staff } = useSession()
  if (!staff) {
    throw new Error('useStaff fuera del área autenticada')
  }
  return staff
}
