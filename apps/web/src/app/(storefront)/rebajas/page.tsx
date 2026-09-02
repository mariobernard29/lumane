import type { Metadata } from 'next'

import { CatalogView } from '@/components/catalog/CatalogView'
import { PAGE_SIZE, parseCatalogParams, SALE_SORT_OPTIONS } from '@/lib/catalog/params'
import { searchCatalog } from '@/lib/queries/catalog'

/**
 * Rebajas.
 *
 * Es el catálogo con `onSale` fijo y un ordenamiento propio que empieza por
 * "Mayor descuento" —lo que la clienta quiere ver primero cuando entra aquí—.
 * El filtro de categorías sigue llevando al catálogo general: dentro de las
 * rebajas, restringir por categoría dejaría retículas casi vacías.
 */
export const metadata: Metadata = {
  title: 'Rebajas',
  description:
    'Piezas seleccionadas con descuento. Series cortas, en cantidades limitadas.',
}

export default async function SalePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = parseCatalogParams(await props.searchParams, SALE_SORT_OPTIONS)

  const result = await searchCatalog({
    onSale: true,
    sizes: params.sizes,
    colors: params.colors,
    sort: params.sort,
    limit: PAGE_SIZE,
    offset: (params.page - 1) * PAGE_SIZE,
  })

  return (
    <CatalogView
      title="Rebajas"
      description="Una selección de conjuntos, vestidos y accesorios con descuento. Piezas únicas, en cantidades limitadas."
      crumbs={[{ label: 'Inicio', href: '/' }, { label: 'Rebajas' }]}
      basePath="/rebajas"
      params={params}
      result={result}
      sortOptions={SALE_SORT_OPTIONS}
      sizeGuideHref="/p/guia-de-tallas"
    />
  )
}
