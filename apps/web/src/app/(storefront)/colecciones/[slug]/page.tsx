import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { CatalogView } from '@/components/catalog/CatalogView'
import { PAGE_SIZE, parseCatalogParams, SORT_OPTIONS } from '@/lib/catalog/params'
import { searchCatalog } from '@/lib/queries/catalog'
import { getCollection } from '@/lib/queries/collections'

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { slug } = await props.params
  const collection = await getCollection(slug)
  if (!collection) return { title: 'Colección' }

  return {
    title: collection.seoTitle ?? collection.name,
    description: collection.seoDescription ?? collection.description,
  }
}

/**
 * Landing de una colección.
 *
 * Es el catálogo con el filtro de colección fijo, igual que `/rebajas` lo es
 * con el de rebaja: mismos filtros, mismo orden, misma retícula. Lo único
 * propio es el encabezado —su fotografía apaisada y su texto—, porque una
 * colección sí tiene identidad editorial y una categoría no.
 *
 * Los filtros de categoría de la barra lateral llevan al catálogo general y
 * salen de la colección, como en rebajas: dentro de un puñado de piezas,
 * cruzar colección con categoría deja retículas vacías casi siempre.
 */
export default async function CollectionPage(props: PageProps) {
  const [{ slug }, rawSearch] = await Promise.all([props.params, props.searchParams])

  const collection = await getCollection(slug)
  if (!collection) notFound()

  const params = parseCatalogParams(rawSearch, SORT_OPTIONS)

  const result = await searchCatalog({
    collectionSlug: slug,
    sizes: params.sizes,
    colors: params.colors,
    sort: params.sort,
    limit: PAGE_SIZE,
    offset: (params.page - 1) * PAGE_SIZE,
  })

  return (
    <CatalogView
      title={collection.name}
      eyebrow={collection.badge ?? 'Colección'}
      description={collection.description}
      banner={
        collection.bannerUrl
          ? { imageUrl: collection.bannerUrl, imageAlt: collection.bannerAlt }
          : null
      }
      crumbs={[
        { label: 'Inicio', href: '/' },
        { label: 'Colecciones', href: '/colecciones' },
        { label: collection.name },
      ]}
      basePath={`/colecciones/${slug}`}
      params={params}
      result={result}
      sortOptions={SORT_OPTIONS}
      sizeGuideHref="/p/guia-de-tallas"
    />
  )
}
