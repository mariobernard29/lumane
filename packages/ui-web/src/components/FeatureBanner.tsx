import Image from 'next/image'
import Link from 'next/link'

import { cn } from '../lib/cn.ts'
import { Icon } from './Icon.tsx'

export interface FeatureBannerProps {
  href: string
  imageUrl: string
  imageAlt: string
  eyebrow?: string | null
  title: string
  body?: string | null
  ctaLabel?: string | null
  /** Ancla para el `aria-labelledby` de la sección que lo contiene. */
  titleId?: string
  priority?: boolean
  className?: string
}

/**
 * Bloque fotográfico ancho con titular de display: la colección destacada de
 * `/colecciones`.
 *
 * Es pariente del `Hero` —misma gramática de degradado, mismo anclaje abajo—
 * pero con dos diferencias que justifican un componente propio: mide poco más
 * de media pantalla en lugar de llenarla, y el bloque ENTERO es un enlace. Por
 * eso la llamada a la acción es un `span` y no un `Button`: un `<a>` dentro de
 * otro `<a>` es HTML inválido y los navegadores lo desanidan, rompiendo el
 * destino del bloque.
 *
 * No lleva `mix-blend-difference` en el titular. En el Hero la fotografía es
 * impredecible; aquí se elige a mano para esta pieza, y la mezcla apagaría el
 * blanco justo sobre las zonas claras del degradado.
 */
export function FeatureBanner({
  href,
  imageUrl,
  imageAlt,
  eyebrow,
  title,
  body,
  ctaLabel,
  titleId,
  priority = false,
  className,
}: FeatureBannerProps) {
  const height = 'min-h-[46vh] md:min-h-[62vh]'

  return (
    <Link
      href={href}
      className={cn(
        'tile group relative block w-full overflow-hidden bg-editorial-ink border border-primary',
        height,
        className,
      )}
    >
      <Image
        src={imageUrl}
        alt={imageAlt}
        fill
        priority={priority}
        sizes="100vw"
        className="tile-media object-cover"
      />
      <span className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/25 to-transparent pointer-events-none" />

      <div className={cn('relative flex flex-col justify-end p-6 md:p-14', height)}>
        {eyebrow ? (
          <p className="font-label-upper text-label-upper uppercase text-white/80 mb-4">{eyebrow}</p>
        ) : null}

        <h2
          id={titleId}
          className="font-display-xl-mobile md:font-display-xl text-display-xl-mobile md:text-display-xl uppercase text-white max-w-2xl mb-5"
        >
          {title}
        </h2>

        {body ? (
          <p className="font-body-md md:font-body-lg text-body-md md:text-body-lg text-white/85 max-w-xl mb-8">
            {body}
          </p>
        ) : null}

        {ctaLabel ? (
          // Las mismas clases que `Button variant="onPhoto"`, en un span.
          <span className="inline-flex w-max items-center justify-center gap-2 bg-paper-bright text-primary border border-paper-bright px-9 py-4 font-label-upper text-label-upper uppercase transition-colors duration-200 group-hover:bg-transparent group-hover:text-paper-bright">
            {ctaLabel}
            <Icon name="arrow_forward" size={18} />
          </span>
        ) : null}
      </div>
    </Link>
  )
}
