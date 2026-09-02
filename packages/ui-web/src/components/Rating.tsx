import { cn } from '../lib/cn.ts'
import { Icon } from './Icon.tsx'

export interface RatingProps {
  /** Nota media, p. ej. 4.8. */
  value: number
  count?: number | null
  size?: number
  /** Enlace al bloque de reseñas. */
  href?: string | null
  className?: string
}

/**
 * Estrellas de valoración.
 *
 * Las estrellas van `aria-hidden` y al lado se pone el texto real
 * ("4.8 de 5"): cinco iconos seguidos son ruido para un lector de pantalla,
 * mientras que la cifra se entiende de inmediato.
 */
export function Rating({ value, count, size = 16, href, className }: RatingProps) {
  const rounded = Math.round(value)

  const stars = (
    <span className="flex gap-0.5 text-accent-red" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((star) => (
        <Icon key={star} name="star" size={size} filled={star <= rounded} />
      ))}
    </span>
  )

  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      {stars}
      <span className="sr-only">{value.toFixed(1)} de 5</span>
      {count != null ? (
        href ? (
          <a
            href={href}
            className="font-body-md text-[13px] text-secondary underline underline-offset-4 hover:text-accent-red transition-colors"
          >
            {value.toFixed(1)} · {count} {count === 1 ? 'reseña' : 'reseñas'}
          </a>
        ) : (
          <span className="font-body-md text-[13px] text-secondary">
            {value.toFixed(1)} · {count} {count === 1 ? 'reseña' : 'reseñas'}
          </span>
        )
      ) : null}
    </span>
  )
}
