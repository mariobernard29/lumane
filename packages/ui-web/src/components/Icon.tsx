import { cn } from '../lib/cn.ts'

export interface IconProps {
  /** Nombre del glifo de Material Symbols, p. ej. `arrow_forward`. */
  name: string
  /**
   * Tamaños del prototipo: 14, 16, 18, 20 y 22.
   *
   * `null` desactiva el tamaño en línea y deja mandar a `className`. Hace falta
   * para el único icono que cambia de tamaño con la pantalla —la lupa del
   * buscador, 28 en móvil y 36 en escritorio—: un `style` en línea gana
   * siempre a `md:text-[36px]`, así que sin esta puerta el icono se quedaría
   * congelado en un tamaño.
   */
  size?: number | null
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
      style={size === null ? undefined : { fontSize: `${size}px` }}
    >
      {name}
    </span>
  )
}
