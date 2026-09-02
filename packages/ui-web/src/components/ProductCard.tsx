import Image from 'next/image'
import Link from 'next/link'

import { cn } from '../lib/cn.ts'
import { discountPercent, formatPrice } from '../lib/format.ts'
import { Badge } from './Badge.tsx'

export interface ProductCardProps {
  href: string
  name: string
  /** Segunda línea del pie, visible solo en escritorio: "Encaje · manga larga". */
  subtitle?: string | null
  imageUrl: string
  imageAlt: string
  priceCents: number
  /** Precio anterior. Si existe, se pinta tachado y aparece el badge de %. */
  compareAtPriceCents?: number | null
  /** Etiquetas propias: "Nuevo", "Últimas piezas", "Edición limitada". */
  labels?: string[]
  /** El prototipo escalona la 2.ª y 4.ª tarjeta de novedades con `md:mt-16`. */
  offset?: boolean
  priority?: boolean
  className?: string
}

/**
 * La pieza central del catálogo.
 *
 * Todo el movimiento vive en `globals.css` (`.p-card`, `.p-frame`, `.p-media`,
 * `.p-caption`, `.p-rule`): la foto nace en blanco y negro y, al pasar el
 * cursor, gana color mientras el pie negro sube y una regla blanca se dibuja
 * de izquierda a derecha. Por eso este componente es de servidor y no lleva
 * ni un estado: en una retícula de 90 piezas eso importa.
 *
 * A diferencia del prototipo —donde muchas tarjetas eran `<div tabindex="0">`
 * sin destino— aquí SIEMPRE es un enlace real: navegable con teclado y
 * legible por un lector de pantalla.
 */
export function ProductCard({
  href,
  name,
  subtitle,
  imageUrl,
  imageAlt,
  priceCents,
  compareAtPriceCents,
  labels = [],
  offset = false,
  priority = false,
  className,
}: ProductCardProps) {
  const percent = discountPercent(priceCents, compareAtPriceCents ?? null)
  const badges = percent ? [`-${percent}%`, ...labels] : labels

  return (
    <Link href={href} className={cn('p-card block group', offset && 'md:mt-16', className)}>
      <div className="p-frame aspect-[3/4] border border-primary">
        <Image
          src={imageUrl}
          alt={imageAlt}
          fill
          sizes="(min-width: 1024px) 33vw, 50vw"
          priority={priority}
          className="p-media"
        />

        {badges.length > 0 ? (
          <div className="absolute top-4 left-4 right-4 z-10 flex flex-wrap items-start gap-1.5">
            {badges.map((label, index) => (
              <Badge key={label} variant={index === 0 && percent ? 'solid' : 'outline'}>
                {label}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="p-caption p-3 md:p-5 flex flex-col md:flex-row md:items-end md:justify-between gap-1 md:gap-3">
          <span className="p-rule" />
          <div>
            <p className="font-label-upper text-[10px] md:text-label-upper uppercase tracking-[0.14em] leading-snug">
              {name}
            </p>
            {subtitle ? (
              <p className="hidden md:block font-body-md text-[13px] text-white/60 mt-1">
                {subtitle}
              </p>
            ) : null}
          </div>

          {compareAtPriceCents ? (
            <span className="flex flex-col items-end whitespace-nowrap">
              <span className="font-price text-[11px] text-white/50 line-through">
                {formatPrice(compareAtPriceCents)}
              </span>
              <span className="font-price text-[13px] md:text-price">{formatPrice(priceCents)}</span>
            </span>
          ) : (
            <span className="font-price text-[13px] md:text-price whitespace-nowrap">
              {formatPrice(priceCents)}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
