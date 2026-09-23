import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'

import { supabase } from '@/lib/supabase'
import { useSession } from '@/lib/session'
import { PENDIENTES, type OrderStatus } from './estados.ts'

/**
 * Cuántos pedidos esperan, en todo momento.
 *
 * Vive en el marco y no en la pantalla de pedidos a propósito: la cajera pasa
 * el 90 % del día en Venta, y un aviso que solo existe dentro de la bandeja es
 * un aviso que nadie ve. El número va en el carril lateral, siempre delante.
 *
 * **Sondeo, no Realtime — todavía.** Realtime llega después y se montará
 * encima de esto, nunca en su lugar: una tablet encendida todo el día pierde
 * el websocket cuando Android duerme la radio o cuando se cae el wifi de la
 * boutique. Con el sondeo de respaldo, un fallo de Realtime significa «el
 * pedido tarda un minuto en aparecer»; sin él significa «el pedido no aparece
 * nunca», que es un pedido perdido.
 */

const CADA_MS = 60_000

interface OrdersState {
  pendientes: number
  refrescar: () => Promise<void>
}

const OrdersContext = createContext<OrdersState>({ pendientes: 0, refrescar: async () => {} })

export function OrdersProvider({ children }: { children: React.ReactNode }) {
  const { staff, can } = useSession()
  const [pendientes, setPendientes] = useState(0)

  // Sin permiso no se consulta: pedir y descartar gastaría una llamada por
  // minuto de toda la jornada para un número que no se va a pintar.
  const puedeVer = can('orders.read')
  const vivo = useRef(true)

  const refrescar = useCallback(async () => {
    if (!staff || !puedeVer) return

    const { data, error } = await supabase.rpc('list_staff_orders', {
      p_channel: 'online',
      p_status: PENDIENTES as OrderStatus[],
      p_limit: 100,
    })

    // Un fallo aquí no se enseña: es un contador de fondo, y una alerta cada
    // minuto porque el wifi parpadeó sería peor que un número desactualizado.
    if (!vivo.current || error) return

    const payload = data as unknown as { items: unknown[] } | null
    setPendientes(payload?.items?.length ?? 0)
  }, [staff, puedeVer])

  useEffect(() => {
    vivo.current = true
    void refrescar()

    const reloj = setInterval(() => void refrescar(), CADA_MS)

    // Volver a primer plano cuenta como el momento más probable de que algo
    // haya cambiado: la tablet estuvo bloqueada y el reloj no corrió.
    const suscripcion = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') void refrescar()
    })

    return () => {
      vivo.current = false
      clearInterval(reloj)
      suscripcion.remove()
    }
  }, [refrescar])

  return <OrdersContext.Provider value={{ pendientes, refrescar }}>{children}</OrdersContext.Provider>
}

export function useOrders(): OrdersState {
  return useContext(OrdersContext)
}
