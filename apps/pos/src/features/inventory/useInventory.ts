import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from '@lumane/db'

import { supabase } from '@/lib/supabase'

/**
 * El inventario de la sucursal, con búsqueda.
 *
 * Mismo rebote y misma guardia de turno que la búsqueda de venta: con el wifi
 * de una tienda, la respuesta de «vest» puede llegar después de la de
 * «vestido», y sin la guardia la lista acabaría enseñando lo que no se pidió.
 */

export interface FilaInventario {
  variant_id: string
  variant_title: string
  sku: string
  barcode: string | null
  price_cents: number
  is_active: boolean
  low_stock_threshold: number
  bin_location: string | null
  product_id: string
  product_name: string
  product_status: string
  on_hand: number
  reserved: number
  available: number
  image_path: string | null
}

const ESPERA_MS = 220

export function useInventory(busqueda: string, soloBajoMinimo: boolean) {
  const [filas, setFilas] = useState<FilaInventario[]>([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const turno = useRef(0)

  const cargar = useCallback(async () => {
    const miTurno = ++turno.current
    setError(null)

    const { data, error: fallo } = await supabase.rpc('list_inventory', {
      p_search: busqueda.trim() === '' ? undefined : busqueda.trim(),
      p_low_only: soloBajoMinimo,
      p_limit: 200,
    })

    if (miTurno !== turno.current) return

    setCargando(false)
    if (fallo) {
      setError(errorMessage(fallo))
      return
    }

    const payload = data as unknown as { items: FilaInventario[]; total: number } | null
    setFilas(payload?.items ?? [])
    setTotal(payload?.total ?? 0)
  }, [busqueda, soloBajoMinimo])

  useEffect(() => {
    const t = setTimeout(() => void cargar(), ESPERA_MS)
    return () => clearTimeout(t)
  }, [cargar])

  return { filas, total, cargando, error, recargar: cargar }
}
