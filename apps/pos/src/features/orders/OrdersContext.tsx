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
 * **Realtime es el timbre; el sondeo es el respaldo, y no es opcional.** Una
 * tablet encendida todo el día pierde el websocket cuando Android duerme la
 * radio, cuando se cae el wifi de la boutique, o cuando el sistema mata el
 * socket sin avisar. Con el sondeo detrás, un fallo de Realtime significa «el
 * pedido tarda un minuto en aparecer»; sin él significa «el pedido no aparece
 * nunca», que es un pedido perdido. Quitar el sondeo porque «Realtime ya
 * funciona» sería cambiar un retraso por una pérdida.
 *
 * El aviso NO trae los datos: al recibirlo se vuelve a preguntar a la base.
 * Así no hay lógica de fusión que mantener, ni huecos por eventos perdidos, ni
 * divergencia entre lo que se ve y lo que hay.
 */

const CADA_MS = 60_000

interface OrdersState {
  pendientes: number
  refrescar: () => Promise<void>
  /** `true` mientras el canal está conectado. Solo informativo. */
  enVivo: boolean
}

const OrdersContext = createContext<OrdersState>({
  pendientes: 0,
  refrescar: async () => {},
  enVivo: false,
})

export function OrdersProvider({ children }: { children: React.ReactNode }) {
  const { staff, can } = useSession()
  const [pendientes, setPendientes] = useState(0)
  const [enVivo, setEnVivo] = useState(false)

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
    // haya cambiado: la tablet estuvo bloqueada y el reloj no corrió. También
    // es cuando conviene no fiarse del websocket, que pudo morir dormido.
    const suscripcion = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') void refrescar()
    })

    return () => {
      vivo.current = false
      clearInterval(reloj)
      suscripcion.remove()
    }
  }, [refrescar])

  // Realtime aparte del sondeo, en su propio efecto: así reconectar el canal no
  // reinicia el reloj ni al revés.
  useEffect(() => {
    if (!staff || !puedeVer) return

    const canal = supabase
      .channel('pedidos-mostrador')
      .on(
        'postgres_changes',
        // Solo `online`: una venta de mostrador la registra esta misma tablet y
        // ya se repinta sola. Filtrar aquí evita que cada venta propia dispare
        // una consulta de vuelta.
        { event: '*', schema: 'public', table: 'orders', filter: 'channel=eq.online' },
        () => {
          // Llega el id, no la fila. Se pregunta a la base en vez de fusionar.
          void refrescar()
        },
      )
      .subscribe((estado) => setEnVivo(estado === 'SUBSCRIBED'))

    return () => {
      setEnVivo(false)
      void supabase.removeChannel(canal)
    }
  }, [staff, puedeVer, refrescar])

  return (
    <OrdersContext.Provider value={{ pendientes, refrescar, enVivo }}>
      {children}
    </OrdersContext.Provider>
  )
}

export function useOrders(): OrdersState {
  return useContext(OrdersContext)
}
