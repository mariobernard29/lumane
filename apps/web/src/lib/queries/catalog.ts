import { cache } from 'react'

import { storageUrl } from '../images.ts'
import { createServerSupabase } from '../supabase/server.ts'

export interface CatalogItem {
  id: string
  slug: string
  name: string
  subtitle: string | null
  imageUrl: string
  imageAlt: string
  priceCents: number
  compareAtPriceCents: number | null
  available: number
}

export interface FacetValue {
  value: string
  count: number
  hex?: string | null
}

export interface CategoryFacet {
  slug: string
  name: string
  count: number
}

export interface CatalogResult {
  items: CatalogItem[]
  total: number
  facets: {
    categories: CategoryFacet[]
    sizes: FacetValue[]
    colors: FacetValue[]
    onSaleCount: number
  }
}

export interface CatalogQuery {
  query?: string | null
  categorySlug?: string | null
  collectionSlug?: string | null
  sizes?: string[]
  colors?: string[]
  onSale?: boolean
  inStockOnly?: boolean
  sort?: string
  limit?: number
  offset?: number
}

/**
 * Catálogo, rebajas, landings y buscador: todo sale del mismo RPC.
 *
 * Un solo viaje a la base devuelve las piezas, el total para la paginación y
 * los conteos de faceta. Hacerlo en varias consultas desde el cliente daría
 * números incoherentes entre sí en cuanto alguien comprara mientras se navega.
 */
export const searchCatalog = cache(async (params: CatalogQuery = {}): Promise<CatalogResult> => {
  const supabase = await createServerSupabase()

  const { data, error } = await supabase.rpc('search_products', {
    p_query: params.query ?? undefined,
    p_category_slug: params.categorySlug ?? undefined,
    p_collection_slug: params.collectionSlug ?? undefined,
    p_sizes: params.sizes?.length ? params.sizes : undefined,
    p_colors: params.colors?.length ? params.colors : undefined,
    p_on_sale: params.onSale ?? false,
    p_in_stock_only: params.inStockOnly ?? false,
    p_sort: params.sort ?? 'featured',
    p_limit: params.limit ?? 9,
    p_offset: params.offset ?? 0,
  })

  if (error || !data) {
    // Un catálogo caído no debe tumbar la página entera. Pero tampoco puede
    // desaparecer en silencio: un fallo del RPC y "no hay piezas que
    // coincidan" se ven IGUAL en pantalla, y sin esta traza el bug puede
    // vivir semanas disfrazado de catálogo vacío.
    if (error) {
      console.error('[catalogo] search_products falló:', error.message, error.details ?? '')
    }
    return { items: [], total: 0, facets: { categories: [], sizes: [], colors: [], onSaleCount: 0 } }
  }

  // El RPC devuelve `jsonb`, que en los tipos generados es `Json`. La forma
  // real la define la migración 0023; el paso por `unknown` deja claro que
  // aquí se está afirmando algo que TypeScript no puede comprobar solo.
  const raw = data as unknown as {
    items: {
      id: string
      slug: string
      name: string
      short_description: string | null
      price_cents: number
      compare_at_price_cents: number | null
      available: number
      image_path: string | null
      image_alt: string | null
    }[]
    total: number
    facets: {
      categories: CategoryFacet[]
      sizes: FacetValue[]
      colors: FacetValue[]
      on_sale_count: number
    }
  }

  return {
    items: raw.items.map((i) => ({
      id: i.id,
      slug: i.slug,
      name: i.name,
      subtitle: i.short_description,
      imageUrl: storageUrl(i.image_path),
      imageAlt: i.image_alt || i.name,
      priceCents: i.price_cents,
      compareAtPriceCents: i.compare_at_price_cents,
      available: i.available,
    })),
    total: raw.total,
    facets: {
      categories: raw.facets.categories ?? [],
      sizes: raw.facets.sizes ?? [],
      colors: raw.facets.colors ?? [],
      onSaleCount: raw.facets.on_sale_count ?? 0,
    },
  }
})

/** Datos de la cabecera de una landing de categoría. */
export const getCategory = cache(async (slug: string) => {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('categories')
    .select('id, name, slug, description, seo_title, seo_description')
    .eq('slug', slug)
    .maybeSingle()
  return data
})
