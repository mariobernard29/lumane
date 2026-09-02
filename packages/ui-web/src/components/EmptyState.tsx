import type { ReactNode } from 'react'

import { cn } from '../lib/cn.ts'
import { Icon } from './Icon.tsx'

export interface EmptyStateProps {
  icon?: string
  title: string
  body?: string | null
  /** Acción para salir del callejón: "Limpiar filtros", "Ver el catálogo"… */
  action?: ReactNode
  className?: string
}

/**
 * Estado vacío.
 *
 * El prototipo no tenía ninguno —siempre mostraba resultados— y es justo donde
 * una tienda pierde a quien la visita. La regla aquí: nunca dejar a la clienta
 * sin una salida, así que `action` está pensado para llevarla de vuelta a algo
 * que sí existe.
 */
export function EmptyState({ icon = 'search_off', title, body, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'border border-outline-variant py-section-v-md px-6 flex flex-col items-center text-center',
        className,
      )}
    >
      <Icon name={icon} size={28} className="text-outline mb-5" />
      <h2 className="font-headline-md text-headline-md mb-3">{title}</h2>
      {body ? (
        <p className="font-body-md text-body-md text-secondary max-w-md mb-8">{body}</p>
      ) : null}
      {action}
    </div>
  )
}
