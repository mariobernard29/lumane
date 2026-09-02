import Link from 'next/link'

import { cn } from '../lib/cn.ts'
import { Icon } from './Icon.tsx'

export interface SectionHeaderProps {
  /** La numeración editorial del prototipo: "01 / Comprar". */
  eyebrow?: string | null
  title: string
  /** Ancla para el enlace "ver todo" y para la navegación interna. */
  id?: string
  linkLabel?: string | null
  linkHref?: string | null
  /** Sobre bloque negro (`bg-editorial-ink`) el contraste se invierte. */
  onDark?: boolean
  className?: string
}

/**
 * Encabezado de sección. Se repite siete veces en la portada del prototipo,
 * siempre con la misma estructura: eyebrow numerado, titular serif y un enlace
 * "ver todo" alineado a la derecha, todo sobre una regla inferior.
 */
export function SectionHeader({
  eyebrow,
  title,
  id,
  linkLabel,
  linkHref,
  onDark = false,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-end justify-between gap-4 mb-8 border-b pb-4',
        onDark ? 'border-on-tertiary' : 'border-primary',
        className,
      )}
    >
      <div>
        {eyebrow ? (
          <p
            className={cn(
              'font-label-upper text-label-upper uppercase mb-3',
              onDark ? 'text-white/75' : 'text-accent-red',
            )}
          >
            {eyebrow}
          </p>
        ) : null}
        <h2
          id={id}
          className={cn(
            'font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg',
            onDark && 'text-on-tertiary',
          )}
        >
          {title}
        </h2>
      </div>

      {linkHref && linkLabel ? (
        <Link
          href={linkHref}
          className={cn(
            'font-label-upper text-label-upper uppercase flex items-center gap-2 transition-colors',
            onDark ? 'text-on-tertiary hover:text-white/70' : 'text-primary hover:text-accent-red',
          )}
        >
          {linkLabel}
          <Icon name="arrow_forward" size={16} />
        </Link>
      ) : null}
    </div>
  )
}
