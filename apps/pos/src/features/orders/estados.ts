import type { Database } from '@lumane/db'

export type OrderStatus = Database['public']['Enums']['order_status']

/**
 * Cómo se llama cada estado en el mostrador, y a dónde puede ir.
 *
 * **Esto es un espejo, no la autoridad.** La tabla de transiciones de verdad
 * vive en `private.transicion_valida()` (migración 0045) y la impone un trigger
 * `before update`. Aquí solo se decide QUÉ BOTONES PINTAR; si este archivo se
 * desincroniza, lo peor que pasa es que la tablet ofrezca un botón que la base
 * rechaza con un mensaje en español, no que el pedido salte de estado.
 *
 * Se duplica a sabiendas: la alternativa sería pedirle a la base las
 * transiciones legales en cada carga, una llamada más por una tabla de siete
 * filas que cambia una vez al año.
 */

interface Estado {
  /** Cómo se lee en la tablet. */
  label: string
  /** Frase corta para la ficha: qué toca hacer ahora. */
  siguiente: string | null
  /** Estados a los que puede avanzar, en el orden en que se pintan. */
  avances: OrderStatus[]
}

export const ESTADOS: Record<OrderStatus, Estado> = {
  draft: { label: 'Borrador', siguiente: null, avances: [] },
  placed: {
    label: 'Por preparar',
    siguiente: 'Entró y está pagado. Falta prepararlo.',
    avances: ['preparing', 'cancelled'],
  },
  preparing: {
    label: 'Preparando',
    siguiente: 'Se está armando. Cuando esté en la caja, márcalo empacado.',
    avances: ['packed', 'cancelled'],
  },
  packed: {
    label: 'Empacado',
    siguiente: 'Listo para salir. Al enviarlo se pide el número de guía.',
    avances: ['shipped', 'cancelled'],
  },
  shipped: {
    label: 'En camino',
    siguiente: 'La clienta ya recibió su número de rastreo.',
    avances: ['delivered'],
  },
  delivered: {
    label: 'Entregado',
    siguiente: 'Se puede cerrar cuando pase el plazo de devolución.',
    avances: ['completed'],
  },
  completed: { label: 'Cerrado', siguiente: null, avances: [] },
  cancelled: { label: 'Cancelado', siguiente: null, avances: [] },
}

/** El verbo del botón que lleva a ese estado. */
export const ACCIONES: Partial<Record<OrderStatus, string>> = {
  preparing: 'Empezar a preparar',
  packed: 'Marcar empacado',
  shipped: 'Enviar con guía',
  delivered: 'Marcar entregado',
  completed: 'Cerrar pedido',
  cancelled: 'Cancelar pedido',
}

/** Los estados de la bandeja que piden trabajo de alguien, en orden. */
export const PENDIENTES: OrderStatus[] = ['placed', 'preparing', 'packed']

export function etiqueta(status: OrderStatus): string {
  return ESTADOS[status]?.label ?? status
}
