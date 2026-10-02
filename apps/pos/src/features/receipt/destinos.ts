import { supabase } from '@/lib/supabase'
import { hayImpresora } from '@/features/printer/impresora'
import { imprimirVenta } from '@/features/printer/tickets'

/**
 * A dónde puede ir un ticket.
 *
 * La hoja de venta y el historial no saben de correos ni de Bluetooth: pintan
 * un botón por cada destino disponible y llaman a `enviar`. Añadir un destino
 * es añadir un elemento a este array.
 */

export interface ContextoTicket {
  /** `true` desde el historial: el papel lo dice, para que no pase por original. */
  reimpresion: boolean
}

export interface DestinoTicket {
  key: string
  label: string
  /** Si un destino no está disponible, su botón no se pinta. */
  disponible: () => boolean
  /** `dato` es lo que haya pedido el destino: el correo, en su caso. */
  enviar: (orderId: string, dato: string | undefined, contexto: ContextoTicket) => Promise<void>
  /**
   * Qué hay que teclear antes de mandar. `null` = nada, se manda directo.
   * Es lo que hace que la hoja pueda pintar el campo correcto sin saber de
   * correos ni de Bluetooth.
   */
  pide: { label: string; placeholder: string; tipo: 'email' } | null
  /** La confirmación que ve la cajera; recibe lo tecleado, si hubo. */
  hecho: (dato: string) => { titulo: string; detalle: string | null }
}

const impresora: DestinoTicket = {
  key: 'impresora',
  label: 'Imprimir',
  disponible: hayImpresora,
  pide: null,
  enviar: (orderId, _dato, contexto) => imprimirVenta(orderId, contexto),
  hecho: () => ({ titulo: 'Ticket impreso.', detalle: null }),
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
  hecho: (dato) => ({
    titulo: `Ticket mandado a ${dato.trim() || 'la clienta'}.`,
    detalle:
      'Puede tardar hasta un minuto en llegar. Si la clienta no lo ve, que revise el correo no deseado.',
  }),
}

// La impresora primero: en el mostrador es lo que se usa casi siempre.
export const DESTINOS: DestinoTicket[] = [impresora, correo]

export function destinosDisponibles(): DestinoTicket[] {
  return DESTINOS.filter((d) => d.disponible())
}
