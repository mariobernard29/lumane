import type { Metadata } from 'next'
import {
  Button,
  EmptyState,
  ProductCard,
  SearchField,
  SectionHeader,
  SortSelect,
  Pagination,
  TagLink,
} from '@lumane/ui-web'

import { HelpCta } from '@/components/cms/CtaSections'
import { buildCatalogHref, PAGE_SIZE, parseCatalogParams, SORT_OPTIONS } from '@/lib/catalog/params'
import { searchCatalog } from '@/lib/queries/catalog'
import { getPageSections } from '@/lib/queries/home'
import { getStoreChrome } from '@/lib/queries/layout'
import { getNewArrivals } from '@/lib/queries/products'
import { getPopularSearches } from '@/lib/queries/search'

export const metadata: Metadata = {
  title: 'Buscar',
  description: 'Busca por nombre, categoría o material entre las piezas de Lumane.',
  // Las páginas de resultados no aportan nada a un buscador: son infinitas y
  // su contenido ya está en el catálogo.
  robots: { index: false },
}

/**
 * Buscador.
 *
 * El campo ES el titular de la página, en tipografía de display, y el estado
 * vive entero en la URL (`/buscar?q=vestido&orden=precio-asc`). Sin JavaScript
 * la búsqueda sigue funcionando: es un formulario GET.
 *
 * Usa el mismo `search_products` que el catálogo. Eso importa más de lo que
 * parece: los resultados respetan exactamente las mismas reglas de visibilidad
 * y de stock que la retícula de `/catalogo`, y no hay una segunda definición
 * de "qué es un producto buscable" que pueda separarse de la primera.
 */
export default async function SearchPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = parseCatalogParams(await props.searchParams, SORT_OPTIONS)
  const query = params.query?.trim() ?? ''

  const [result, popular, suggestions, sections, chrome] = await Promise.all([
    // Sin texto no se consulta la base: la página en blanco del buscador no es
    // el catálogo completo, es una invitación a escribir.
    query
      ? searchCatalog({
          query,
          sizes: params.sizes,
          colors: params.colors,
          sort: params.sort,
          limit: PAGE_SIZE,
          offset: (params.page - 1) * PAGE_SIZE,
        })
      : null,
    getPopularSearches(),
    getNewArrivals(4),
    getPageSections('buscar'),
    getStoreChrome(),
  ])

  const href = (overrides: Parameters<typeof buildCatalogHref>[0]['overrides']) =>
    buildCatalogHref({ basePath: '/buscar', params, allowedSorts: SORT_OPTIONS, overrides })

  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1

  return (
    <>
      <section className="px-5 sm:px-margin-edge pt-10 md:pt-16 pb-8 border-b border-primary">
        <p className="font-label-upper text-label-upper uppercase text-accent-red mb-4">Buscar</p>

        <SearchField action="/buscar" value={query} />

        {popular.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 mt-6">
            <span className="font-label-upper text-label-upper uppercase text-secondary mr-1">
              Búsquedas populares
            </span>
            {popular.map((item) => (
              <TagLink key={item.href + item.label} href={item.href} emphasis={item.emphasis}>
                {item.label}
              </TagLink>
            ))}
          </div>
        ) : null}
      </section>

      <section
        className="px-5 sm:px-margin-edge pt-10 pb-section-v-md md:pb-section-v-lg"
        aria-labelledby="t-resultados"
      >
        {result ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-primary pb-4 mb-8">
              <h1
                id="t-resultados"
                className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg"
              >
                {result.total === 0
                  ? `Sin resultados para «${query}»`
                  : `${result.total} ${result.total === 1 ? 'resultado' : 'resultados'} para «${query}»`}
              </h1>

              {result.total > 0 ? (
                <SortSelect
                  options={SORT_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.value === 'featured' ? 'Más relevantes' : option.label,
                    href: href({ sort: option.value }),
                  }))}
                  value={params.sort}
                />
              ) : null}
            </div>

            {result.items.length === 0 ? (
              <EmptyState
                icon="search_off"
                title="No encontramos ninguna pieza con ese nombre"
                body="Revisa la ortografía o prueba con una palabra más corta —«vestido» en lugar de «vestido largo de encaje»—. También puedes recorrer el catálogo completo."
                action={
                  <Button href="/catalogo" variant="outline" size="md">
                    Ver el catálogo
                  </Button>
                }
              />
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 md:gap-x-col-gap gap-y-10 md:gap-y-14">
                  {result.items.map((item, index) => (
                    <ProductCard
                      key={item.id}
                      href={`/producto/${item.slug}`}
                      name={item.name}
                      subtitle={item.subtitle}
                      imageUrl={item.imageUrl}
                      imageAlt={item.imageAlt}
                      priceCents={item.priceCents}
                      compareAtPriceCents={item.compareAtPriceCents}
                      labels={item.available <= 0 ? ['Agotado'] : []}
                      priority={index < 3}
                    />
                  ))}
                </div>

                <Pagination
                  page={params.page}
                  totalPages={totalPages}
                  buildHref={(page) => href({ page })}
                />
              </>
            )}
          </>
        ) : (
          <h1
            id="t-resultados"
            className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg border-b border-primary pb-4 mb-8"
          >
            ¿Qué estás buscando?
          </h1>
        )}

        {/* Bajo los resultados, algo que mirar. No son sugerencias calculadas a
            partir de la búsqueda —eso sería mentir sobre lo que hace— sino lo
            último que entró a la tienda, que es lo que la boutique enseñaría a
            una clienta que no encuentra lo que venía a buscar. */}
        {suggestions.length > 0 ? (
          <div
            className={`border-t border-primary pt-10 ${
              // Con resultados arriba hace falta aire que los separe de lo que
              // ya no es resultado. Sin búsqueda, este bloque ES la página y el
              // hueco solo empuja las piezas fuera de la vista.
              result ? 'mt-section-v-sm md:mt-section-v-md' : 'mt-2'
            }`}
          >
            <SectionHeader
              eyebrow="También te podría interesar"
              title="Lo último que llegó"
              linkLabel="Ver novedades"
              linkHref="/catalogo?orden=novedades"
            />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 md:gap-x-col-gap gap-y-10">
              {suggestions.map((product) => (
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
                />
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {sections
        .filter((section) => section.type === 'help_cta')
        .map((section) => (
          <HelpCta
            key={section.id}
            section={section}
            whatsappNumber={chrome.settings.whatsappNumber}
          />
        ))}
    </>
  )
}
