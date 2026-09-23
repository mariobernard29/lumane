import { useCallback, useEffect, useRef, useState } from 'react'

import { supabase } from '@/lib/supabase'
import type { OrderStatus } from './estados.ts'

/**
 * La lista de pedidos: la bandeja de la web y el historial del mostrador.
 *
 * Una sola función de la base (`list_staff_orders`) sirve a las dos, con el
 * canal como filtro. Aquí se repite la decisión: un hook, dos usos.
 */

export interface OrderRow {
  id: string
  order_number: string
  channel: 'pos' | 'online'
  status: OrderStatus
  payment_status: string
  total_cents: number
  placed_at: string | null
  created_at: string
  line_count: number
  recipient: string | null
  tracking_number: string | null
  customer: {
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
    phone: string | null
  } | null
}

/** El mismo rebote que la búsqueda de variantes: teclear no dispara una por letra. */
const ESPERA_MS = 220

interface Opciones {
  channel: 'pos' | 'online'
  status?: OrderStatus[] | null
  search?: string
}

export function useStaffOrders({ channel, status, search = '' }: Opciones) {
  const [rows, setRows] = useState<OrderRow[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Guardia contra respuestas fuera de orden: con rebote de 220 ms y una red de
  // tienda, la respuesta de «vest» puede llegar después de la de «vestido».
  const turno = useRef(0)

  // Se serializan porque son arrays y objetos: sin esto el efecto se dispara en
  // cada render aunque el filtro no haya cambiado.
  const claveEstados = status ? status.join(',') : ''

  const cargar = useCallback(async () => {
    const miTurno = ++turno.current
    setError(null)

    const { data, error: fallo } = await supabase.rpc('list_staff_orders', {
      p_channel: channel,
      p_status: status && status.length > 0 ? status : undefined,
      p_search: search.trim() === '' ? undefined : search.trim(),
      p_limit: 100,
    })

    if (miTurno !== turno.current) return

    setCargando(false)
    if (fallo) {
      setError(fallo.message)
      return
    }

    const payload = data as unknown as { items: OrderRow[] } | null
    setRows(payload?.items ?? [])
    // eslint-disable-next-line react-hooks/exhaustive-deps -- claveEstados sustituye a `status`
  }, [channel, claveEstados, search])

  useEffect(() => {
    const t = setTimeout(() => void cargar(), ESPERA_MS)
    return () => clearTimeout(t)
  }, [cargar])

  return { rows, cargando, error, recargar: cargar }
}
