import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { cn } from '../lib/cn.ts'
import { Icon } from './Icon.tsx'

export interface HeaderNavItem {
  id: string
  label: string
  href: string
  isEmphasized: boolean
}

export interface HeaderProps {
  /** Las 12 entradas del nav, leídas de `navigation_items` (menú `header`). */
  items: HeaderNavItem[]
  /** Ruta actual, para marcar `aria-current` y activar el subrayado. */
  currentPath?: string
  /** Nombre de la clienta con sesión iniciada. Null si es una visita. */
  customerName?: string | null
  /** Piezas en la bolsa. Alimenta el contador del icono. */
  cartCount?: number
  logoUrl: string
  /** Ranura para el mini-carrito, que sí necesita ser cliente. */
  cartSlot?: ReactNode
}

/**
 * Cabecera fija de 108px: una fila de 64px con el logo centrado y otra de 44px
 * con las categorías.
 *
 * Fiel al prototipo: **no hay mega menú ni botón de hamburguesa**. En móvil la
 * barra de categorías simplemente se desplaza en horizontal — con la barra de
 * scroll oculta (`no-scrollbar`) para que el gesto se sienta continuo.
 */
export function Header({
  items,
  currentPath,
  customerName,
  cartCount = 0,
  logoUrl,
  cartSlot,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full bg-paper-bright border-b border-primary">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center h-16 px-5 sm:px-margin-edge">
        {/* `invisible` en lugar de `hidden`: conserva su columna para que el
            logo siga centrado en móvil, igual que en el prototipo. */}
        <Link
          href="/cuenta"
          className="invisible sm:visible justify-self-start font-label-upper text-[10px] uppercase tracking-[0.16em] text-secondary hover:text-accent-red transition-colors"
        >
          {customerName ? `Hola, ${customerName}` : 'Iniciar sesión'}
        </Link>

        <Link href="/" aria-label="LUMANE, ir al inicio" className="justify-self-center flex items-center">
          <Image
            src={logoUrl}
            alt="LUMANE"
            // Tamaño intrínseco real del archivo (150x54). Declarar otra
            // proporción hace que Next reserve una caja deformada.
            width={150}
            height={54}
            priority
            className="h-7 md:h-9 w-auto object-contain"
          />
        </Link>

        <div className="justify-self-end flex items-center gap-4 md:gap-6 text-primary">
          <Link href="/buscar" aria-label="Buscar" className="hover:text-accent-red transition-colors">
            <Icon name="search" size={22} />
          </Link>
          <Link
            href="/cuenta"
            aria-label="Mi cuenta"
            className="hidden sm:block hover:text-accent-red transition-colors"
          >
            <Icon name="person" size={22} />
          </Link>

          {cartSlot ?? (
            <Link
              href="/carrito"
              aria-label={`Bolsa de compras, ${cartCount} ${cartCount === 1 ? 'artículo' : 'artículos'}`}
              className="relative hover:text-accent-red transition-colors"
            >
              <Icon name="shopping_bag" size={22} />
              {cartCount > 0 ? (
                <span className="absolute -top-1.5 -right-2 bg-accent-red text-on-primary text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                  {cartCount}
                </span>
              ) : null}
            </Link>
          )}
        </div>
      </div>

      <nav aria-label="Categorías" className="border-t border-surface-variant">
        {/* Doce categorías no caben en 1440px. El contenedor exterior hace el
            scroll y el interior se centra con `mx-auto`: mientras quepan van
            centradas como en el prototipo, y en cuanto desbordan se alinean al
            inicio. Con `justify-center` en el propio contenedor de scroll, las
            primeras entradas quedarían recortadas e inalcanzables. */}
        <div className="h-11 px-5 sm:px-margin-edge overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-7 md:gap-10 h-11 w-max mx-auto">
            {items.map((item) => {
              const isCurrent = currentPath === item.href
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={isCurrent ? 'page' : undefined}
                  className={cn(
                    'nav-item font-nav-link text-nav-link uppercase whitespace-nowrap transition-colors',
                    item.isEmphasized || isCurrent
                      ? 'text-primary'
                      : 'text-secondary hover:text-primary',
                    item.isEmphasized && 'font-bold',
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      </nav>
    </header>
  )
}
