/**
 * Traducción de los errores de los RPC a mensajes que puede leer una clienta
 * o una cajera.
 *
 * Los RPC lanzan excepciones con `errcode` y a veces `hint`. PostgREST los
 * devuelve como `{ code, message, hint, details }`. Convertirlos aquí — y no
 * en cada pantalla — evita que un `check_violation` acabe impreso en un ticket.
 */

export interface PostgrestLikeError {
  code?: string
  message?: string
  hint?: string | null
  details?: string | null
}

/** Situaciones que la interfaz debe tratar de forma especial, no solo mostrar. */
export type LumaneErrorKind =
  /** No hay caja abierta: el POS debe ofrecer abrirla. */
  | 'register_closed'
  /** Ya hay un turno abierto en esta sucursal. */
  | 'register_already_open'
  /** El stock se agotó entre el carrito y el pago: hay que volver a la bolsa. */
  | 'out_of_stock'
  /** Falta permiso para la acción. */
  | 'forbidden'
  /** El recurso no existe o caducó (carrito, pedido, cupón). */
  | 'not_found'
  | 'unknown'

export function classifyError(error: PostgrestLikeError | null | undefined): LumaneErrorKind {
  if (!error) return 'unknown'
  if (error.hint === 'register_closed') return 'register_closed'
  if (error.hint === 'register_already_open') return 'register_already_open'

  switch (error.code) {
    case '23514': // check_violation
      return 'out_of_stock'
    case '42501': // insufficient_privilege
      return 'forbidden'
    case 'P0002': // no_data_found
      return 'not_found'
    default:
      return 'unknown'
  }
}

const FALLBACK: Record<LumaneErrorKind, string> = {
  register_closed: 'No hay caja abierta. Ábrela para empezar a vender.',
  register_already_open: 'Ya hay una caja abierta en esta sucursal.',
  out_of_stock: 'Alguna pieza ya no tiene inventario suficiente.',
  forbidden: 'No tienes permiso para esta acción.',
  not_found: 'No encontramos lo que buscabas.',
  unknown: 'Algo salió mal. Vuelve a intentarlo.',
}

/**
 * Mensaje para la persona. Los RPC ya lanzan textos redactados en español
 * ("Solo quedan 2 piezas de esta talla"), así que se prefiere el del servidor
 * y solo se recurre al genérico cuando no hay uno útil.
 */
export function errorMessage(error: PostgrestLikeError | null | undefined): string {
  const kind = classifyError(error)
  const raw = error?.message?.trim()
  if (raw && !raw.startsWith('new row') && !raw.includes('violates')) {
    return raw
  }
  return FALLBACK[kind]
}
