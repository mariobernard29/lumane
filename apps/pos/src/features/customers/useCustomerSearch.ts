import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from '@lumane/db'

import { supabase } from '@/lib/supabase'

/**
 * Buscar una clienta por nombre, teléfono o correo.
 *
 * Con la cadena vacía devuelve nada, no todo: una lista de todas las clientas
 * no ayuda a encontrar a ninguna, y en el mostrador se busca a alguien
 * concreto que está delante.
 */

export interface ClientaEncontrada {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  nombre: string
}

const ESPERA_MS = 250

export function useCustomerSearch(consulta: string) {
  const [resultados, setResultados] = useState<ClientaEncontrada[]>([])
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const turno = useRef(0)

  const buscar = useCallback(async (texto: string) => {
    const limpio = texto.trim()
    if (limpio === '') {
      setResultados([])
      setBuscando(false)
      return
    }

    const miTurno = ++turno.current
    setBuscando(true)
    setError(null)

    const { data, error: fallo } = await supabase.rpc('search_customers', {
      p_query: limpio,
      p_limit: 20,
    })

    if (miTurno !== turno.current) return

    setBuscando(false)
    if (fallo) {
      setError(errorMessage(fallo))
      return
    }
    setResultados((data as unknown as ClientaEncontrada[]) ?? [])
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void buscar(consulta), ESPERA_MS)
    return () => clearTimeout(t)
  }, [consulta, buscar])

  return { resultados, buscando, error, buscar }
}
