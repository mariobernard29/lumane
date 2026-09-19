import Image from 'next/image'
import { BUCKETS } from '@lumane/db'
import { Button, whatsappHref } from '@lumane/ui-web'

import { storageUrl } from '@/lib/images'
import type { PageSection } from '@/lib/queries/home'

/**
 * Los bloques de "escríbenos" que cierran `/colecciones` y `/buscar`.
 *
 * Viven en `page_sections`, así que su texto lo edita la boutique. Si el
 * `config` no trae destino, el botón lleva al WhatsApp de `store_settings`:
 * repetir ahí el número sería garantizar que algún día deje de coincidir con
 * el del pie de página.
 */

interface CtaProps {
  section: PageSection
  /** El número de la tienda, para el destino por defecto. */
  whatsappNumber: string | null
}

function resolveHref(section: PageSection, whatsappNumber: string | null): string | null {
  const configured = typeof section.config.ctaHref === 'string' ? section.config.ctaHref : null
  return configured || whatsappHref(whatsappNumber)
}

function readString(section: PageSection, key: string): string | null {
  const value = section.config[key]
  return typeof value === 'string' && value ? value : null
}

interface ConfigImage {
  path: string
  alt: string
}

function readImages(section: PageSection): ConfigImage[] {
  const raw = section.config.images
  if (!Array.isArray(raw)) return []

  return raw.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return []
    const { path, alt } = item as { path?: unknown; alt?: unknown }
    if (typeof path !== 'string' || !path) return []
    // Sin `alt` la fotografía no se pinta. En un bloque decorativo es
    // preferible una columna vacía a una imagen muda para quien usa lector de
    // pantalla; y obliga a que el POS pida el texto al subirla.
    if (typeof alt !== 'string' || !alt) return []
    return [{ path, alt }]
  })
}

/**
 * Bloque alto a dos columnas sobre negro: texto a la izquierda, fotografías
 * escalonadas a la derecha. El cierre de `/colecciones`.
 */
export function EditorialCta({ section, whatsappNumber }: CtaProps) {
  const href = resolveHref(section, whatsappNumber)
  const label = readString(section, 'ctaLabel')
  const icon = readString(section, 'ctaIcon') ?? undefined
  const images = readImages(section)

  // Un bloque de llamada a la acción sin acción no es un bloque a medias: es un
  // titular que promete algo y no lleva a ninguna parte. Se omite entero. Hoy
  // eso pasa mientras `store_settings.whatsapp_number` esté vacío; en cuanto se
  // capture el número, el bloque aparece solo.
  if (!section.title || !href || !label) return null

  return (
    <section className="bg-editorial-ink text-on-tertiary" aria-labelledby={`cta-${section.id}`}>
      <div className="px-5 sm:px-margin-edge py-section-v-md md:py-section-v-lg grid grid-cols-1 lg:grid-cols-12 gap-col-gap items-center">
        <div className="lg:col-span-6">
          {section.eyebrow ? (
            <p className="font-label-upper text-label-upper uppercase text-white mb-3">
              {section.eyebrow}
            </p>
          ) : null}
          <h2
            id={`cta-${section.id}`}
            className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg mb-7 leading-tight"
          >
            {section.title}
          </h2>
          {section.subtitle ? (
            <p className="font-body-md text-body-md text-white/70 max-w-lg mb-8">
              {section.subtitle}
            </p>
          ) : null}
          <Button href={href} variant="onDark" icon={icon}>
            {label}
          </Button>
        </div>

        {images.length > 0 ? (
          <div className="lg:col-span-5 lg:col-start-8 grid grid-cols-2 gap-4 mt-10 lg:mt-0">
            {images.slice(0, 2).map((image, index) => (
              <div
                key={image.path}
                // La segunda baja 32px: el escalonado editorial del prototipo,
                // que rompe la línea base a propósito.
                className={`relative aspect-[3/4] border border-on-primary-fixed-variant ${
                  index === 1 ? 'mt-8' : ''
                }`}
              >
                <Image
                  src={storageUrl(image.path, BUCKETS.content)}
                  alt={image.alt}
                  fill
                  sizes="(min-width: 1024px) 20vw, 45vw"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}

/**
 * Franja negra de una línea con el botón a la derecha. El cierre de `/buscar`,
 * donde el bloque alto de colecciones robaría protagonismo a los resultados.
 */
export function HelpCta({ section, whatsappNumber }: CtaProps) {
  const href = resolveHref(section, whatsappNumber)
  const label = readString(section, 'ctaLabel')
  const icon = readString(section, 'ctaIcon') ?? undefined

  if (!section.title || !href || !label) return null

  return (
    <section className="bg-editorial-ink text-on-tertiary" aria-labelledby={`cta-${section.id}`}>
      <div className="px-5 sm:px-margin-edge py-section-v-md flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
        <div>
          <h2 id={`cta-${section.id}`} className="font-headline-md text-headline-md mb-2">
            {section.title}
          </h2>
          {section.subtitle ? (
            <p className="font-body-md text-body-md text-white/65">{section.subtitle}</p>
          ) : null}
        </div>
        <Button href={href} variant="onPhoto" icon={icon} className="whitespace-nowrap">
          {label}
        </Button>
      </div>
    </section>
  )
}
