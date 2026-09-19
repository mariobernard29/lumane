import Link from 'next/link'

import { cn } from '../lib/cn.ts'

export interface TagLinkProps {
  href: string
  children: React.ReactNode
  /** Contorno negro en lugar de gris: el atajo que la tienda quiere empujar. */
  emphasis?: boolean
  className?: string
}

/**
 * Atajo rectangular con contorno: los chips de "búsquedas populares".
 *
 * No es un `Badge` —aquel es una etiqueta de 10px que describe una pieza— ni
 * un `Button`, que en este sistema siempre lleva `label-upper`. Esto es un
 * enlace de navegación y por eso usa `nav-link`, la misma tipografía que las
 * categorías de la cabecera.
 */
export function TagLink({ href, children, emphasis = false, className }: TagLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center px-4 py-2 font-nav-link text-nav-link uppercase transition-colors',
        emphasis
          ? 'border border-primary text-primary'
          : 'border border-outline-variant text-secondary hover:border-primary hover:text-primary',
        className,
      )}
    >
      {children}
    </Link>
  )
}
