import { supabase } from '@/lib/supabase'

/**
 * A dónde puede ir un ticket.
 *
 * **Este archivo existe para poder no construir la impresora todavía.** La
 * boutique no tiene una, y montar el transporte Bluetooth a ciegas —sin un
 * aparato con el que probar— sería escribir código que nadie puede verificar.
 * Mientras tanto el ticket va por correo.
 *
 * El día que llegue la impresora no se toca ni la hoja de venta ni el RPC: se
 * añade un elemento más a este array.
 *
 *     {
 *       key: 'impresora',
 *       label: 'Imprimir',
 *       disponible: () => bluetooth.hayImpresoraEmparejada(),
 *       async enviar(orderId) {
 *         const { data } = await supabase.rpc('get_pos_sale', { p_order_id: orderId })
 *         await bluetooth.escribir(buildSaleTicket(aTicketData(data), 32))
 *       },
 *     }
 *
 * `buildSaleTicket` y `EscPosBuilder` ya están escritos y probados a 32 y 48
 * columnas en `@lumane/core`; lo único que falta es el transporte. Y
 * `get_pos_sale` ya devuelve exactamente la forma que necesitan.
 */

export interface DestinoTicket {
  key: string
  label: string
  /** Si un destino no está disponible, su botón no se pinta. */
  disponible: () => boolean
  /** `dato` es lo que haya pedido el destino: el correo, en este caso. */
  enviar: (orderId: string, dato?: string) => Promise<void>
  /**
   * Qué hay que teclear antes de mandar. `null` = nada, se manda directo.
   * Es lo que hace que la hoja pueda pintar el campo correcto sin saber de
   * correos ni de Bluetooth.
   */
  pide: { label: string; placeholder: string; tipo: 'email' } | null
}

const correo: DestinoTicket = {
  key: 'correo',
  label: 'Mandar por correo',
  disponible: () => true,
  pide: {
    label: 'Correo de la clienta',
    placeholder: 'nombre@correo.com',
    tipo: 'email',
  },
  async enviar(orderId, dato) {
    const { error } = await supabase.rpc('pos_send_receipt', {
      p_order_id: orderId,
      // Sin correo explícito el RPC usa el de la clienta asociada, si la hay.
      p_email: dato?.trim() || undefined,
    })
    if (error) throw error
  },
}

export const DESTINOS: DestinoTicket[] = [correo]

export function destinosDisponibles(): DestinoTicket[] {
  return DESTINOS.filter((d) => d.disponible())
}
