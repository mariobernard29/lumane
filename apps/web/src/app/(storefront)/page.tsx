import { Button, Hero, Newsletter, ProductCard, SectionHeader, ServicesBar, Tile } from '@lumane/ui-web'

import { subscribeToNewsletter } from '@/actions/newsletter'
import { getCategoryTiles, getCollectionTiles, getHero, getServices } from '@/lib/queries/home'
import { getStoreChrome } from '@/lib/queries/layout'
import { getNewArrivals, getOnSale } from '@/lib/queries/products'

/**
 * Portada.
 *
 * Reproduce la secuencia editorial del prototipo: portada a sangre, franja de
 * servicios y luego secciones numeradas (01 / Comprar, 02 / Novedades…), cada
 * una con su encabezado sobre una regla y su enlace "ver todo".
 *
 * Ni un texto ni una imagen están escritos aquí: todo viene de la base y se
 * administra desde el POS. Una sección sin contenido sencillamente no se pinta,
 * en lugar de dejar un hueco o un texto de relleno.
 *
 * Nota sobre caché: hoy se renderiza en cada petición, porque el marco de la
 * tienda lee la cookie del carrito y eso vuelve dinámica toda la ruta. Poner
 * aquí un `export const revalidate` sería engañoso: no haría nada. La caché
 * por entidad con invalidación desde la base es trabajo de la Fase 4.
 */
export default async function HomePage() {
  const [hero, services, categories, newArrivals, onSale, collections, chrome] = await Promise.all([
    getHero('home'),
    getServices(),
    getCategoryTiles(4),
    getNewArrivals(4),
    getOnSale(3),
    getCollectionTiles(4),
    getStoreChrome(),
  ])

  return (
    <>
      {hero ? <Hero {...hero} /> : null}
      <ServicesBar items={services} />

      {/* ---- 01 / Comprar por categoría ---- */}
      {categories.length > 0 ? (
        <section className="px-5 sm:px-margin-edge pt-section-v-md md:pt-section-v-lg">
          <SectionHeader
            eyebrow="01 / Comprar"
            title="Comprar por categoría"
            id="t-categorias"
            linkLabel="Ver todo el catálogo"
            linkHref="/catalogo"
          />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-col-gap">
            {categories.map((category) => (
              <Tile
                key={category.id}
                href={`/catalogo/${category.slug}`}
                label={category.name}
                imageUrl={category.imageUrl}
                imageAlt={category.imageAlt}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* ---- 02 / Novedades ---- */}
      {newArrivals.length > 0 ? (
        <section className="px-5 sm:px-margin-edge pt-section-v-md md:pt-section-v-lg">
          <SectionHeader
            eyebrow="02 / Novedades"
            title="Lo último que llegó"
            id="t-novedades"
            linkLabel="Ver novedades"
            linkHref="/catalogo?orden=novedades"
          />
          {/* La 2.ª y la 4.ª tarjeta bajan 64px en escritorio: el escalonado
              editorial del prototipo, que rompe la retícula a propósito. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 md:gap-x-col-gap gap-y-10 md:gap-y-14">
            {newArrivals.map((product, index) => (
              <ProductCard
                key={product.id}
                href={`/producto/${product.slug}`}
                name={product.name}
                subtitle={product.subtitle}
                imageUrl={product.imageUrl}
                imageAlt={product.imageAlt}
                priceCents={product.priceCents}
                compareAtPriceCents={product.compareAtPriceCents}
                labels={product.labels}
                offset={index % 2 === 1}
                priority={index < 2}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* ---- 03 / Por tiempo limitado ---- */}
      {onSale.length > 0 ? (
        <section className="px-5 sm:px-margin-edge pt-section-v-md md:pt-section-v-lg">
          <SectionHeader
            eyebrow="03 / Por tiempo limitado"
            title="Rebajas"
            id="t-rebajas"
            linkLabel="Ver todas las rebajas"
            linkHref="/rebajas"
          />
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 md:gap-x-col-gap gap-y-10 md:gap-y-14">
            {onSale.map((product) => (
              <ProductCard
                key={product.id}
                href={`/producto/${product.slug}`}
                name={product.name}
                subtitle={product.subtitle}
                imageUrl={product.imageUrl}
                imageAlt={product.imageAlt}
                priceCents={product.priceCents}
                compareAtPriceCents={product.compareAtPriceCents}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* ---- 04 / Colecciones ---- */}
      {collections.length > 0 ? (
        <section className="px-5 sm:px-margin-edge pt-section-v-md md:pt-section-v-lg pb-section-v-md md:pb-section-v-lg">
          <SectionHeader
            eyebrow="04 / Colecciones"
            title="Elige por temporada u ocasión"
            id="t-colecciones"
            linkLabel="Ver colecciones"
            linkHref="/colecciones"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-col-gap gap-y-10 md:gap-y-14">
            {collections.map((collection) => (
              <Tile
                key={collection.id}
                href={`/colecciones/${collection.slug}`}
                label={collection.name}
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

      {/* ---- 05 / Nuestra casa ---- */}
      <section
        id="historia"
        className="scroll-mt-28 bg-editorial-ink text-on-tertiary px-5 sm:px-margin-edge py-section-v-md md:py-section-v-lg"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-col-gap items-center">
          <div className="lg:col-span-6">
            <SectionHeader eyebrow="05 / Nuestra casa" title="Series cortas, hechas para durar" onDark />
            <p className="font-body-md md:font-body-lg text-body-md md:text-body-lg text-white/70 max-w-lg mb-9">
              Lumane nace en Los Mochis con una idea simple: producir poco y producir bien. Cada pieza
              se trabaja en tiradas cortas, con telas elegidas a mano y acabados que resisten más de
              una temporada.
            </p>
            <Button href="/p/nuestra-historia" variant="onDark" size="sm" icon="arrow_forward">
              Conocer la casa
            </Button>
          </div>
        </div>
      </section>

      <Newsletter
        eyebrow="Boletín"
        title={chrome.settings.newsletterTitle ?? 'Antes que nadie.'}
        body={chrome.settings.newsletterBody}
        disclaimer={chrome.settings.newsletterDisclaimer}
        tone="dark"
        action={subscribeToNewsletter}
      />
    </>
  )
}
