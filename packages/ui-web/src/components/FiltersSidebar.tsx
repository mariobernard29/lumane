import Link from 'next/link'

import { cn } from '../lib/cn.ts'
import { Badge } from './Badge.tsx'
import { Icon } from './Icon.tsx'

export interface FilterOption {
  label: string
  href: string
  count?: number | null
  isActive: boolean
  /** Solo en los filtros de color: el hex del swatch. */
  hex?: string | null
}

export interface ActiveChip {
  label: string
  /** URL que resulta de QUITAR este filtro. */
  href: string
  removeLabel: string
}

export interface FiltersSidebarProps {
  categories: FilterOption[]
  sizes: FilterOption[]
  colors: FilterOption[]
  activeChips: ActiveChip[]
  clearHref: string
  /** Enlace a la guía de tallas, editable desde el CMS. */
  sizeGuideHref?: string | null
  sizeNote?: string | null
}

/**
 * Barra de filtros del catálogo.
 *
 * Es un `<details>`: acordeón por debajo de 1024px y barra lateral fija por
 * encima (lo resuelve `globals.css`, sin JavaScript). El prototipo necesitaba
 * un script que forzara `open` al redimensionar; aquí basta con
 * `.filters > .filters-body { display: block !important }` en escritorio.
 *
 * Cada filtro es un ENLACE, no una casilla: el estado vive en la URL. Eso hace
 * que los filtros funcionen sin JavaScript, que se puedan compartir por
 * WhatsApp y que el botón "atrás" del navegador haga lo que se espera.
 */
export function FiltersSidebar({
  categories,
  sizes,
  colors,
  activeChips,
  clearHref,
  sizeGuideHref,
  sizeNote,
}: FiltersSidebarProps) {
  return (
    <aside className="w-full lg:w-64 xl:w-72 flex-shrink-0">
      <details className="filters lg:sticky lg:top-[128px]" open>
        <summary className="flex items-center justify-between border-y border-primary py-4 mb-6 lg:mb-0">
          <span className="font-label-upper text-label-upper uppercase flex items-center gap-3">
            <Icon name="tune" size={20} />
            Filtrar y ordenar
          </span>
          <Icon name="expand_more" size={20} className="filters-chevron transition-transform" />
        </summary>

        <div className="filters-body space-y-9">
          {categories.length > 0 ? (
            <div>
              <h2 className="font-label-upper text-label-upper uppercase border-b border-primary pb-2 mb-4">
                Categoría
              </h2>
              <ul className="flex flex-col gap-2.5 font-body-md text-body-md">
                {categories.map((option) => (
                  <li key={option.href}>
                    <Link
                      href={option.href}
                      className={cn(
                        'flex justify-between items-center transition-colors group',
                        option.isActive
                          ? 'text-primary font-medium'
                          : 'text-secondary hover:text-primary',
                      )}
                    >
                      <span className="group-hover:text-accent-red transition-colors">
                        {option.label}
                      </span>
                      {option.count != null ? (
                        <span className="text-text-muted font-price text-price">({option.count})</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {sizes.length > 0 ? (
            <div>
              <div className="flex items-end justify-between border-b border-primary pb-2 mb-4">
                <h2 className="font-label-upper text-label-upper uppercase">Talla</h2>
                {sizeGuideHref ? (
                  <Link
                    href={sizeGuideHref}
                    className="font-label-upper text-[10px] uppercase tracking-[0.16em] text-secondary underline underline-offset-4 hover:text-accent-red transition-colors"
                  >
                    Guía de tallas
                  </Link>
                ) : null}
              </div>
              <div className="grid grid-cols-5 gap-2">
                {sizes.map((option) => (
                  <Link
                    key={option.href}
                    href={option.href}
                    aria-pressed={option.isActive}
                    className={cn(
                      'h-10 flex items-center justify-center font-nav-link text-nav-link transition-colors',
                      option.isActive
                        ? 'border-2 border-primary bg-primary text-on-primary'
                        : 'border border-outline-variant text-secondary hover:border-primary hover:text-primary',
                    )}
                  >
                    {option.label}
                  </Link>
                ))}
              </div>
              {sizeNote ? (
                <p className="font-body-md text-[13px] text-text-muted mt-3">{sizeNote}</p>
              ) : null}
            </div>
          ) : null}

          {colors.length > 0 ? (
            <div>
              <h2 className="font-label-upper text-label-upper uppercase border-b border-primary pb-2 mb-4">
                Color
              </h2>
              <div className="flex flex-wrap gap-4">
                {colors.map((option) => (
                  <Link
                    key={option.href}
                    href={option.href}
                    aria-label={`Color ${option.label}`}
                    aria-pressed={option.isActive}
                    title={option.label}
                    className={cn(
                      'w-7 h-7 rounded-full border border-outline transition-all',
                      option.isActive
                        ? 'ring-1 ring-offset-2 ring-primary'
                        : 'hover:ring-1 hover:ring-offset-2 hover:ring-primary',
                    )}
                    style={{ backgroundColor: option.hex ?? '#E2E2E2' }}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {activeChips.length > 0 ? (
            <div className="border-t border-surface-variant pt-6">
              <h2 className="font-label-upper text-label-upper uppercase mb-4">Filtros activos</h2>
              <div className="flex flex-wrap gap-2 mb-4">
                {activeChips.map((chip) => (
                  <Link key={chip.href + chip.label} href={chip.href} aria-label={chip.removeLabel}>
                    <Badge variant="chip">
                      {chip.label}
                      <Icon name="close" size={14} />
                    </Badge>
                  </Link>
                ))}
              </div>
              <Link
                href={clearHref}
                className="font-label-upper text-label-upper uppercase underline underline-offset-4 hover:text-accent-red transition-colors"
              >
                Limpiar todo
              </Link>
            </div>
          ) : null}
        </div>
      </details>
    </aside>
  )
}
