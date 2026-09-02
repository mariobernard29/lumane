import type { ReactNode } from 'react'

import { cn } from '../lib/cn.ts'
import { Icon } from './Icon.tsx'

/**
 * Las cinco variantes de etiqueta del prototipo. Todas comparten la misma
 * tipografía diminuta en mayúsculas (10px / 700 / tracking .16em) y el radio
 * cero; lo único que cambia es el contraste según sobre qué se posan.
 */
export type BadgeVariant =
  /** Negro sólido: "Nuevo", "Destacado", "-40%". Sobre fotografía. */
  | 'solid'
  /** Blanco con contorno negro: "Últimas piezas". Sobre fotografía clara. */
  | 'outline'
  /** Sobre bloque oscuro: "Edición limitada". */
  | 'onDark'
  /** Dato tipográfico con contorno tenue: el SKU en la ficha de producto. */
  | 'data'
  /** Chip de filtro activo, con botón de cierre. */
  | 'chip'

const VARIANTS: Record<BadgeVariant, string> = {
  solid: 'bg-accent-red text-on-primary px-2 py-1',
  outline: 'bg-paper-bright text-primary border border-primary px-2 py-1',
  onDark: 'bg-editorial-ink border border-on-tertiary text-on-tertiary px-3 py-1.5',
  data: 'text-secondary border border-outline-variant px-2 py-1',
  chip: 'border border-primary px-3 py-1.5 gap-2',
}

export interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  /** Icono a la izquierda, como en los estados de pedido ("En camino"). */
  icon?: string
  /** Presente solo en los chips de filtro: los vuelve removibles. */
  onRemove?: () => void
  removeLabel?: string
  className?: string
}

export function Badge({
  variant = 'solid',
  children,
  icon,
  onRemove,
  removeLabel,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center font-label-upper text-[10px] uppercase tracking-[0.16em] leading-none',
        VARIANTS[variant],
        icon && 'gap-2',
        className,
      )}
    >
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel ?? 'Quitar filtro'}
          onClick={onRemove}
          className="hover:text-accent-red transition-colors"
        >
          <Icon name="close" size={14} />
        </button>
      ) : null}
    </span>
  )
}
