import Link from 'next/link'
import { Fragment } from 'react'

export interface Crumb {
  label: string
  href?: string
}

/**
 * Migas de pan de las páginas internas. La última entrada nunca es un enlace y
 * lleva `aria-current="page"`; los separadores van `aria-hidden` para que un
 * lector de pantalla no lea "barra" entre cada nivel.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Ruta de navegación" className="px-5 sm:px-margin-edge pt-6">
      <ol className="flex items-center gap-2 font-label-upper text-[10px] uppercase tracking-[0.16em] text-secondary">
        {items.map((item, index) => (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 ? (
              <li aria-hidden="true" className="text-outline-variant">
                /
              </li>
            ) : null}
            <li>
              {item.href ? (
                <Link href={item.href} className="hover:text-accent-red transition-colors">
                  {item.label}
                </Link>
              ) : (
                <span aria-current="page" className="text-primary">
                  {item.label}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  )
}
