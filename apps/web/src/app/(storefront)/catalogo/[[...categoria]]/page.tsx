import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { CatalogView } from '@/components/catalog/CatalogView'
import { PAGE_SIZE, parseCatalogParams, SORT_OPTIONS } from '@/lib/catalog/params'
import { getCategory, searchCatalog } from '@/lib/queries/catalog'

/**
 * Catálogo completo y landings de categoría.
 *
 * Una sola ruta con catch-all opcional sirve `/catalogo` y
 * `/catalogo/vestidos`. La categoría es parte de la RUTA, no un parámetro de
 * búsqueda: cada una es una página indexable con su propio título, su
 * descripción y su lugar en las migas de pan.
 */

interface PageProps {
  params: Promise<{ categoria?: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

async function resolve(props: PageProps) {
  const [{ categoria }, rawSearch] = await Promise.all([props.params, props.searchParams])

  // El catch-all admite varios segmentos; el catálogo solo usa uno. Más de uno
  // es una URL inventada y merece un 404, no una página a medias.
  if (categoria && categoria.length > 1) notFound()
  const slug = categoria?.[0] ?? null

  return { slug, params: parseCatalogParams(rawSearch, SORT_OPTIONS) }
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { slug } = await resolve(props)
  if (!slug) {
    return {
      title: 'Catálogo',
      description: 'Todas las piezas de Lumane: vestidos, sets, camisas, bolsos y más.',
    }
  }

  const category = await getCategory(slug)
  if (!category) return { title: 'Catálogo' }

  return {
    title: category.seo_title ?? category.name,
    description: category.seo_description ?? category.description,
  }
}

export default async function CatalogPage(props: PageProps) {
  const { slug, params } = await resolve(props)

  const category = slug ? await getCategory(slug) : null
  if (slug && !category) notFound()

  const result = await searchCatalog({
    categorySlug: slug,
    sizes: params.sizes,
    colors: params.colors,
    sort: params.sort,
    limit: PAGE_SIZE,
    offset: (params.page - 1) * PAGE_SIZE,
  })

  return (
    <CatalogView
      title={category?.name ?? 'Catálogo'}
      description={
        category?.description ??
        'Piezas de autor en series cortas. Filtra por categoría, talla o color para encontrar la tuya.'
      }
      crumbs={
        category
          ? [{ label: 'Inicio', href: '/' }, { label: 'Catálogo', href: '/catalogo' }, { label: category.name }]
          : [{ label: 'Inicio', href: '/' }, { label: 'Catálogo' }]
      }
      basePath={slug ? `/catalogo/${slug}` : '/catalogo'}
      params={params}
      result={result}
      sortOptions={SORT_OPTIONS}
      activeCategorySlug={slug}
      sizeGuideHref="/p/guia-de-tallas"
    />
  )
}
