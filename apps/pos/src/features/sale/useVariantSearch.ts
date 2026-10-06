import { useCallback, useEffect, useRef, useState } from 'react'

import { supabase } from '@/lib/supabase'

/**
 * Búsqueda de variantes contra `pos_search_variants`.
 *
 * Dos cosas que hacen la diferencia en el mostrador:
 *
 * 1. **No se busca en cada tecla.** Se espera 220 ms desde la última: quien
 *    teclea "vestido" dispararía siete consultas y vería siete listas
 *    parpadeando. 220 ms es más rápido que escribir la siguiente letra y más
 *    lento que un tecleo normal.
 *
 * 2. **Las respuestas viejas se descartan.** Si la de "ves" tarda más que la
 *    de "vestido", llegaría después y pisaría el resultado bueno. Cada consulta
 *    lleva su número de turno y solo se acepta la última.
 */

export interface VariantHit {
  variant_id: string
  product_id: string
  product_name: string
  variant_title: string
  sku: string
  barcode: string | null
  price_cents: number
  image_path: string | null
  available: number
  on_hand: number
  rank: number
}

const ESPERA_MS = 220

export function useVariantSearch(query: string) {
  const [results, setResults] = useState<VariantHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const turno = useRef(0)

  const buscar = useCallback(async (texto: string) => {
    const miTurno = ++turno.current
    setLoading(true)

    const { data, error: fallo } = await supabase.rpc('pos_search_variants', {
      p_query: texto.trim() === '' ? undefined : texto.trim(),
      p_limit: 60,
    })

    // Llegó tarde: ya hay una búsqueda más nueva en marcha.
    if (miTurno !== turno.current) return

    setLoading(false)

    if (fallo) {
      // Una lista vacía y un fallo de red se ven IGUAL en pantalla, y la
      // cajera concluiría que la prenda no existe. Se dice lo que pasó.
      setError(fallo.message)
      setResults([])
      return
    }

    setError(null)
    setResults((data as unknown as VariantHit[]) ?? [])
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void buscar(query), ESPERA_MS)
    return () => clearTimeout(t)
  }, [query, buscar])

  /**
   * Búsqueda inmediata, sin espera. La usa el escáner: un código de barras
   * llega completo de golpe y esperar 220 ms más es tiempo regalado con la
   * clienta delante.
   */
  const buscarYa = useCallback(
    async (texto: string): Promise<VariantHit[]> => {
      const miTurno = ++turno.current
      const { data, error: fallo } = await supabase.rpc('pos_search_variants', {
        p_query: texto.trim(),
        p_limit: 10,
      })
      if (miTurno !== turno.current) return []
      if (fallo) {
        setError(fallo.message)
        return []
      }
      const hits = (data as unknown as VariantHit[]) ?? []
      setError(null)
      setResults(hits)
      return hits
    },
    [],
  )

  /**
   * Vuelve a pedir la lista que se está viendo. Las existencias de cada
   * tarjeta son una foto del momento de la búsqueda: tras una venta, una
   * devolución o una entrada de mercancía, sin esto la pantalla seguiría
   * diciendo que quedan dos de lo que se acaba de vender.
   */
  const recargar = useCallback((texto: string) => buscar(texto), [buscar])

  return { results, loading, error, buscarYa, recargar }
}
