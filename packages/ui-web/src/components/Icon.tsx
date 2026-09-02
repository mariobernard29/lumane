import { cn } from '../lib/cn.ts'

export interface IconProps {
  /** Nombre del glifo de Material Symbols, p. ej. `arrow_forward`. */
  name: string
  /** Tamaños del prototipo: 14, 16, 18, 20, 22 y 28/36 en el buscador. */
  size?: number
  /** Variante rellena: estrellas de reseña, corazón de favorito activo. */
  filled?: boolean
  className?: string
}

/**
 * Material Symbols Outlined, la misma familia de iconos del prototipo.
 * Se declara `aria-hidden` porque en el diseño el icono siempre acompaña a un
 * texto o a un `aria-label` del elemento que lo contiene: anunciarlo dos veces
 * ensucia el lector de pantalla.
 */
export function Icon({ name, size = 18, filled = false, className }: IconProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('material-symbols-outlined', filled && 'fill', className)}
      style={{ fontSize: `${size}px` }}
    >
      {name}
    </span>
  )
}
