import Image from 'next/image'
import { Fragment } from 'react'

import { Button } from './Button.tsx'

export interface HeroProps {
  imageUrl: string
  imageAlt: string
  eyebrow?: string | null
  title: string
  subtitle?: string | null
  ctaLabel?: string | null
  ctaHref?: string | null
  secondaryCtaLabel?: string | null
  secondaryCtaHref?: string | null
}

/**
 * Portada a pantalla completa.
 *
 * Detalles del prototipo que no son casuales:
 *  - Altura `84vh` en móvil y `calc(100vh - 108px)` en escritorio: resta
 *    exactamente la cabecera, para que la foto llene lo que queda sin cortar.
 *  - El contenido se ancla ABAJO (`justify-end`), no al centro.
 *  - El H1 lleva `mix-blend-difference`: el titular se invierte contra la
 *    fotografía y siempre se lee, sea clara u oscura la zona que le toque.
 *  - Dos capas de oscurecimiento: un velo plano al 25% y un degradado inferior.
 *  - La imagen entra con `heroReveal` (escala 1.06 → 1 en 1.9s).
 */
export function Hero({
  imageUrl,
  imageAlt,
  eyebrow,
  title,
  subtitle,
  ctaLabel,
  ctaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
}: HeroProps) {
  return (
    <section className="relative w-full min-h-[84vh] md:min-h-[calc(100vh-108px)] overflow-hidden bg-editorial-ink">
      <Image
        src={imageUrl}
        alt={imageAlt}
        fill
        priority
        sizes="100vw"
        className="hero-media object-cover object-top"
      />
      <div className="absolute inset-0 bg-black/25 pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 via-black/30 to-transparent pointer-events-none" />

      <div className="relative min-h-[84vh] md:min-h-[calc(100vh-108px)] flex flex-col justify-end px-5 sm:px-margin-edge pb-14 md:pb-section-v-md">
        {eyebrow ? (
          <p className="font-label-upper text-label-upper uppercase text-white/80 mb-5">{eyebrow}</p>
        ) : null}

        {/* El titular de portada se corta en dos líneas a propósito ("La nueva /
            silueta"). El administrador lo escribe con un salto de línea real y
            aquí se traduce a <br>, porque en HTML un "\n" se colapsa y el
            titular quedaría en una sola línea desbordando la retícula. */}
        <h1 className="font-display-xl-mobile md:font-display-xl text-display-xl-mobile md:text-display-xl uppercase text-white mix-blend-difference max-w-5xl mb-7">
          {title.split('\n').map((line, index) => (
            <Fragment key={line + index}>
              {index > 0 ? <br /> : null}
              {line}
            </Fragment>
          ))}
        </h1>

        {subtitle ? (
          <p className="font-body-md md:font-body-lg text-body-md md:text-body-lg text-white/90 max-w-xl mb-9">
            {subtitle}
          </p>
        ) : null}

        {(ctaHref && ctaLabel) || (secondaryCtaHref && secondaryCtaLabel) ? (
          <div className="flex flex-wrap gap-4">
            {ctaHref && ctaLabel ? (
              <Button href={ctaHref} variant="onPhoto">
                {ctaLabel}
              </Button>
            ) : null}
            {secondaryCtaHref && secondaryCtaLabel ? (
              <Button href={secondaryCtaHref} variant="ghostPhoto">
                {secondaryCtaLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
