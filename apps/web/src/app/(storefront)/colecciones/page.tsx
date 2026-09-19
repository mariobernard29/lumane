import type { Metadata } from 'next'
import { Breadcrumbs, FeatureBanner, SectionHeader, Tile } from '@lumane/ui-web'

import { EditorialCta } from '@/components/cms/CtaSections'
import { getPageSections } from '@/lib/queries/home'
import { getStoreChrome } from '@/lib/queries/layout'
import { getCollections } from '@/lib/queries/collections'

export const metadata: Metadata = {
  title: 'Colecciones',
  description:
    'Selecciones curadas por temporada y por ocasión. Cada colección reúne piezas pensadas para combinarse entre sí.',
}

/**
 * Índice de colecciones.
 *
 * La destacada es simplemente la PRIMERA por `position`. Reordenar desde el
 * POS cambia la portada de esta página, sin banderas que mantener: una columna
 * `is_featured` admitiría dos destacadas o ninguna, y habría que decidir qué
 * hacer en ambos casos.
 *
 * Para el bloque grande se prefiere `banner_path` —la fotografía apaisada— y
 * se cae a la de la tarjeta si no la tiene: un retrato 4/5 recortado a 62vh de
 * alto se queda sin cabeza, pero es mejor que un hueco.
 */
export default async function CollectionsPage() {
  const [collections, sections, chrome] = await Promise.all([
    getCollections(),
    getPageSections('colecciones'),
    getStoreChrome(),
  ])

  const [featured, ...rest] = collections

  return (
    <>
      <Breadcrumbs items={[{ label: 'Inicio', href: '/' }, { label: 'Colecciones' }]} />

      <header className="px-5 sm:px-margin-edge pt-8 pb-10 md:pb-14">
        <h1 className="font-display-xl-mobile md:font-display-xl text-display-xl-mobile md:text-display-xl uppercase mb-6">
          Colecciones
        </h1>
        <p className="font-body-md md:font-body-lg text-body-md md:text-body-lg text-secondary max-w-2xl">
          Selecciones curadas por temporada y por momento del día. Cada colección reúne un puñado de
          piezas pensadas para combinarse entre sí, desde el clóset de primavera hasta las series
          numeradas de autor.
        </p>
      </header>

      {featured ? (
        <section
          className="px-5 sm:px-margin-edge pb-section-v-md md:pb-section-v-lg"
          aria-labelledby="t-destacada"
        >
          <FeatureBanner
            href={`/colecciones/${featured.slug}`}
            imageUrl={featured.bannerUrl ?? featured.imageUrl}
            imageAlt={featured.bannerUrl ? featured.bannerAlt : featured.imageAlt}
            eyebrow="Colección del momento"
            title={featured.name}
            titleId="t-destacada"
            body={featured.description}
            ctaLabel="Ver colección"
            priority
          />
        </section>
      ) : null}

      {rest.length > 0 ? (
        <section
          className="px-5 sm:px-margin-edge pb-section-v-md md:pb-section-v-lg"
          aria-labelledby="t-todas"
        >
          <SectionHeader
            eyebrow="Todas las colecciones"
            title="Elige por temporada u ocasión"
            id="t-todas"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 md:gap-x-col-gap gap-y-10 md:gap-y-14">
            {rest.map((collection) => (
              <Tile
                key={collection.id}
                href={`/colecciones/${collection.slug}`}
                label={collection.name}
                eyebrow={pieceCount(collection.productCount)}
                description={collection.description}
                badge={collection.badge}
                ctaLabel="Ver colección"
                imageUrl={collection.imageUrl}
                imageAlt={collection.imageAlt}
                ratio="4/5"
              />
            ))}
          </div>
        </section>
      ) : null}

      {sections
        .filter((section) => section.type === 'editorial_cta')
        .map((section) => (
          <EditorialCta
            key={section.id}
            section={section}
            whatsappNumber={chrome.settings.whatsappNumber}
          />
        ))}
    </>
  )
}

/** "17 piezas" — y "1 pieza" cuando queda una sola, que en series cortas pasa. */
function pieceCount(count: number): string | null {
  if (count === 0) return null
  return count === 1 ? '1 pieza' : `${count} piezas`
}
