import Link from 'next/link'

import { cn } from '../lib/cn.ts'
import { Icon } from './Icon.tsx'

export interface PaginationProps {
  page: number
  totalPages: number
  /** Construye la URL de una página. La página lo sabe; este componente no. */
  buildHref: (page: number) => string
  label?: string
}

/**
 * Paginación numérica con elipsis.
 *
 * El prototipo mostraba además un botón "Cargar más piezas" JUNTO a los
 * números. Se deja solo la paginación: dos mecanismos para lo mismo confunden
 * (¿en qué página estoy si cargué más?), rompen el botón "atrás" y duplican el
 * contenido para los buscadores. La paginación por URL es compartible y
 * recuperable; "cargar más" no.
 */
export function Pagination({ page, totalPages, buildHref, label = 'Paginación del catálogo' }: PaginationProps) {
  if (totalPages <= 1) return null

  const pages = pageWindow(page, totalPages)

  return (
    <nav aria-label={label} className="mt-14 flex flex-col items-center gap-6">
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            href={buildHref(page - 1)}
            aria-label="Página anterior"
            rel="prev"
            className="w-10 h-10 border border-outline-variant flex items-center justify-center text-primary hover:border-primary transition-colors"
          >
            <Icon name="chevron_left" size={18} />
          </Link>
        ) : (
          <span
            aria-hidden="true"
            className="w-10 h-10 border border-outline-variant flex items-center justify-center text-outline cursor-not-allowed"
          >
            <Icon name="chevron_left" size={18} />
          </span>
        )}

        {pages.map((entry, index) =>
          entry === null ? (
            <span key={`gap-${index}`} className="px-1 text-secondary">
              …
            </span>
          ) : entry === page ? (
            <span
              key={entry}
              aria-current="page"
              className="w-10 h-10 flex items-center justify-center border-2 border-primary bg-primary text-on-primary font-nav-link text-nav-link"
            >
              {entry}
            </span>
          ) : (
            <Link
              key={entry}
              href={buildHref(entry)}
              className="w-10 h-10 flex items-center justify-center border border-outline-variant text-secondary hover:border-primary hover:text-primary transition-colors font-nav-link text-nav-link"
            >
              {entry}
            </Link>
          ),
        )}

        {page < totalPages ? (
          <Link
            href={buildHref(page + 1)}
            aria-label="Página siguiente"
            rel="next"
            className={cn(
              'w-10 h-10 border border-outline-variant flex items-center justify-center',
              'text-primary hover:border-primary transition-colors',
            )}
          >
            <Icon name="chevron_right" size={18} />
          </Link>
        ) : (
          <span
            aria-hidden="true"
            className="w-10 h-10 border border-outline-variant flex items-center justify-center text-outline cursor-not-allowed"
          >
            <Icon name="chevron_right" size={18} />
          </span>
        )}
      </div>
    </nav>
  )
}

/**
 * Ventana de páginas con elipsis: 1 … 4 5 6 … 11.
 * `null` marca dónde va el hueco.
 */
function pageWindow(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages = new Set<number>([1, total, current])
  if (current - 1 > 1) pages.add(current - 1)
  if (current + 1 < total) pages.add(current + 1)
  // Con la página 1 o 2 activa, se enseña algo más de contexto por delante.
  if (current <= 3) pages.add(2).add(3).add(4)
  if (current >= total - 2) pages.add(total - 1).add(total - 2).add(total - 3)

  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)

  const result: (number | null)[] = []
  let previous = 0
  for (const p of sorted) {
    if (previous && p - previous > 1) result.push(null)
    result.push(p)
    previous = p
  }
  return result
}
