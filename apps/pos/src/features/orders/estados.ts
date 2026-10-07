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

export type TipoEntrega = Database['public']['Enums']['shipping_kind']

/**
 * Cómo se llama cada estado. `shipped` significa «salió de nuestras manos», y
 * eso se dice distinto según la entrega: por paquetería va en camino, en
 * entrega local va con el repartidor, y si lo recoge la clienta, la espera en
 * el mostrador. El estado en la base es el mismo; solo cambia cómo se lee.
 */
export function etiqueta(status: OrderStatus, tipo?: TipoEntrega | null): string {
  return (tipo ? POR_TIPO[tipo]?.label?.[status] : null) ?? ESTADOS[status]?.label ?? status
}

/** Lee el tipo de entrega de `shipping_method_snapshot`. */
export function tipoEntrega(metodo: Record<string, unknown> | null | undefined): TipoEntrega | null {
  const kind = metodo?.kind
  return kind === 'flat' || kind === 'local_delivery' || kind === 'pickup' ? kind : null
}

/**
 * Lo que cambia cuando no hay paquetería: ni transportista ni guía. Lo que no
 * aparece aquí se lee de `ESTADOS` y `ACCIONES`.
 */
interface Textos {
  label?: Partial<Record<OrderStatus, string>>
  siguiente?: Partial<Record<OrderStatus, string>>
  acciones?: Partial<Record<OrderStatus, string>>
}

const POR_TIPO: Partial<Record<TipoEntrega, Textos>> = {
  local_delivery: {
    siguiente: {
      packed: 'Listo para salir. Cuando salga de la sucursal, márcalo en reparto.',
      shipped: 'Salió de la sucursal y está en proceso de entrega.',
    },
    acciones: { shipped: 'Salió a entregar' },
  },
  pickup: {
    label: { shipped: 'Listo para recoger', delivered: 'Recogido' },
    siguiente: {
      packed: 'Empacado. Cuando esté en el mostrador, márcalo listo: se le avisa a la clienta.',
      shipped: 'Espera en el mostrador. Márcalo recogido cuando la clienta pase por él.',
    },
    acciones: { shipped: 'Listo para recoger', delivered: 'Marcar recogido' },
  },
}

export function siguientePaso(status: OrderStatus, tipo: TipoEntrega | null): string | null {
  return (tipo ? POR_TIPO[tipo]?.siguiente?.[status] : null) ?? ESTADOS[status]?.siguiente ?? null
}

export function accion(destino: OrderStatus, tipo: TipoEntrega | null): string {
  return (tipo ? POR_TIPO[tipo]?.acciones?.[destino] : null) ?? ACCIONES[destino] ?? etiqueta(destino, tipo)
}

/** Sin paquetería no hay guía que pedir: se marca enviado directo. */
export function sinGuia(tipo: TipoEntrega | null): boolean {
  return tipo === 'local_delivery' || tipo === 'pickup'
}
