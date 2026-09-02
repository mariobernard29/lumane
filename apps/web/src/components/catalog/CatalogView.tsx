import {
  Breadcrumbs,
  Button,
  EmptyState,
  FiltersSidebar,
  Pagination,
  ProductCard,
  SortSelect,
  type ActiveChip,
  type Crumb,
  type FilterOption,
} from '@lumane/ui-web'

import {
  buildCatalogHref,
  toggleValue,
  type CatalogParams,
  PAGE_SIZE,
} from '@/lib/catalog/params'
import type { CatalogResult } from '@/lib/queries/catalog'

interface CatalogViewProps {
  title: string
  description?: string | null
  crumbs: Crumb[]
  /** Ruta sin query string: `/catalogo`, `/catalogo/vestidos`, `/rebajas`. */
  basePath: string
  /** Ruta a la que llevan los filtros de categoría (en /rebajas no cambia). */
  categoryBasePath?: string
  params: CatalogParams
  result: CatalogResult
  sortOptions: readonly { value: string; label: string; param: string }[]
  /** Slug de categoría activo, si la ruta es una landing de categoría. */
  activeCategorySlug?: string | null
  sizeGuideHref?: string | null
}

/**
 * La retícula del catálogo con sus filtros.
 *
 * La comparten `/catalogo`, `/catalogo/[categoría]` y `/rebajas`: son la misma
 * pantalla con distinto encabezado y distinto filtro base. Duplicarla
 * garantizaría que las tres se separaran con el tiempo.
 */
export function CatalogView({
  title,
  description,
  crumbs,
  basePath,
  categoryBasePath = '/catalogo',
  params,
  result,
  sortOptions,
  activeCategorySlug = null,
  sizeGuideHref,
}: CatalogViewProps) {
  const href = (overrides: Partial<CatalogParams>) =>
    buildCatalogHref({ basePath, params, allowedSorts: sortOptions, overrides })

  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE))
  const from = result.total === 0 ? 0 : (params.page - 1) * PAGE_SIZE + 1
  const to = Math.min(params.page * PAGE_SIZE, result.total)

  // Las categorías cambian de RUTA, no de parámetro: `/catalogo/vestidos` es
  // una página indexable con su propio título y descripción, no un filtro.
  const categoryOptions: FilterOption[] = [
    {
      label: 'Todo',
      href: buildCatalogHref({ basePath: categoryBasePath, params, allowedSorts: sortOptions }),
      count: result.facets.categories.reduce((sum, c) => sum + c.count, 0),
      isActive: activeCategorySlug === null,
    },
    ...result.facets.categories.map((category) => ({
      label: category.name,
      href: buildCatalogHref({
        basePath: `${categoryBasePath}/${category.slug}`,
        params,
        allowedSorts: sortOptions,
      }),
      count: category.count,
      isActive: activeCategorySlug === category.slug,
    })),
  ]

  const sizeOptions: FilterOption[] = result.facets.sizes.map((size) => ({
    label: size.value,
    href: href({ sizes: toggleValue(params.sizes, size.value) }),
    isActive: params.sizes.includes(size.value),
  }))

  const colorOptions: FilterOption[] = result.facets.colors.map((color) => ({
    label: color.value,
    href: href({ colors: toggleValue(params.colors, color.value) }),
    isActive: params.colors.includes(color.value),
    hex: color.hex,
  }))

  const activeChips: ActiveChip[] = [
    ...params.sizes.map((size) => ({
      label: `Talla ${size}`,
      href: href({ sizes: params.sizes.filter((s) => s !== size) }),
      removeLabel: `Quitar el filtro de talla ${size}`,
    })),
    ...params.colors.map((color) => ({
      label: color,
      href: href({ colors: params.colors.filter((c) => c !== color) }),
      removeLabel: `Quitar el filtro de color ${color}`,
    })),
  ]

  return (
    <>
      <Breadcrumbs items={crumbs} />

      <header className="px-5 sm:px-margin-edge pt-8 pb-10 md:pb-14">
        <h1 className="font-display-xl-mobile md:font-display-xl text-display-xl-mobile md:text-display-xl uppercase mb-6">
          {title}
        </h1>
        {description ? (
          <p className="font-body-md md:font-body-lg text-body-md md:text-body-lg text-secondary max-w-2xl">
            {description}
          </p>
        ) : null}
      </header>

      <section className="px-5 sm:px-margin-edge pb-section-v-md md:pb-section-v-lg flex flex-col lg:flex-row gap-10 lg:gap-col-gap">
        <FiltersSidebar
          categories={categoryOptions}
          sizes={sizeOptions}
          colors={colorOptions}
          activeChips={activeChips}
          clearHref={basePath}
          sizeGuideHref={sizeGuideHref}
          sizeNote="Equivalencias MX 34 – 42."
        />

        <div className="flex-grow min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-primary pb-4 mb-8">
            <p className="font-body-md text-body-md text-secondary">
              {result.total === 0 ? (
                'Sin resultados'
              ) : (
                <>
                  Mostrando{' '}
                  <span className="text-primary">
                    {from}–{to}
                  </span>{' '}
                  de {result.total} {result.total === 1 ? 'pieza' : 'piezas'}
                </>
              )}
            </p>
            {result.total > 0 ? (
              <SortSelect
                options={sortOptions.map((o) => ({
                  value: o.value,
                  label: o.label,
                  href: href({ sort: o.value }),
                }))}
                value={params.sort}
              />
            ) : null}
          </div>

          {result.items.length === 0 ? (
            <EmptyState
              icon="search_off"
              title="No encontramos piezas con esos filtros"
              body="Prueba quitando alguno, o escríbenos por WhatsApp y una asesora te ayuda a encontrar la pieza exacta."
              action={
                <Button href={basePath} variant="outline" size="md">
                  Limpiar filtros
                </Button>
              }
            />
          ) : (
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
          )}

          <Pagination
            page={params.page}
            totalPages={totalPages}
            buildHref={(page) => href({ page })}
          />
        </div>
      </section>
    </>
  )
}
