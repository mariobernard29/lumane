import Image from 'next/image'
import Link from 'next/link'

import { cn } from '../lib/cn.ts'
import { Badge } from './Badge.tsx'
import { Icon } from './Icon.tsx'

export interface TileProps {
  href: string
  label: string
  imageUrl: string
  imageAlt: string
  /** Conteo de piezas o eyebrow: "40 piezas numeradas". */
  eyebrow?: string | null
  description?: string | null
  /** "Edición limitada" — chip en la esquina superior. */
  badge?: string | null
  ctaLabel?: string | null
  /** `3/4` para categorías (portada), `4/5` para colecciones. */
  ratio?: '3/4' | '4/5'
  /** Las piezas editoriales del prototipo van en gris. */
  grayscale?: boolean
  className?: string
}

/**
 * Mosaico de categoría o colección: fotografía a sangre con degradado inferior
 * y texto encima. Al pasar el cursor la imagen escala a 1.06 (regla `.tile` de
 * `globals.css`).
 *
 * La variante compacta (solo `label`) es la retícula "Comprar por categoría"
 * de la portada; con `eyebrow`, `description` y `ctaLabel` se convierte en la
 * tarjeta de colección de `/colecciones`.
 */
export function Tile({
  href,
  label,
  imageUrl,
  imageAlt,
  eyebrow,
  description,
  badge,
  ctaLabel,
  ratio = '3/4',
  grayscale = false,
  className,
}: TileProps) {
  const isRich = Boolean(eyebrow ?? description ?? ctaLabel)

  return (
    <Link
      href={href}
      className={cn(
        'tile group relative block overflow-hidden bg-editorial-ink',
        ratio === '3/4' ? 'aspect-[3/4]' : 'aspect-[4/5]',
        isRich && 'border border-primary',
        className,
      )}
    >
      <Image
        src={imageUrl}
        alt={imageAlt}
        fill
        sizes="(min-width: 1024px) 25vw, 50vw"
        className={cn('tile-media object-cover', grayscale && 'grayscale')}
      />
      <span
        className={cn(
          'absolute inset-x-0 bottom-0 pointer-events-none bg-gradient-to-t to-transparent',
          isRich ? 'h-3/5 from-black/85' : 'h-2/3 from-black/75',
        )}
      />

      {badge ? (
        <span className="absolute top-5 left-5 z-10">
          <Badge variant="outline">{badge}</Badge>
        </span>
      ) : null}

      {isRich ? (
        <div className="absolute inset-x-0 bottom-0 p-6 md:p-8 text-on-tertiary">
          {eyebrow ? (
            <p className="font-label-upper text-label-upper uppercase text-white/75 mb-2">
              {eyebrow}
            </p>
          ) : null}
          <h3 className="font-headline-md text-headline-md mb-2">{label}</h3>
          {description ? (
            <p className="font-body-md text-[14px] text-white/70 mb-5 max-w-xs">{description}</p>
          ) : null}
          {ctaLabel ? (
            <span className="inline-flex items-center gap-2 font-label-upper text-label-upper uppercase text-white group-hover:gap-3 transition-all">
              {ctaLabel}
              <Icon name="arrow_forward" size={16} />
            </span>
          ) : null}
        </div>
      ) : (
        <span className="absolute inset-x-0 bottom-0 p-5 flex items-center justify-between">
          <span className="font-label-upper text-label-upper uppercase text-white">{label}</span>
          <Icon
            name="arrow_outward"
            size={18}
            className="text-white opacity-0 group-hover:opacity-100 transition-opacity"
          />
        </span>
      )}
    </Link>
  )
}
