import { cache } from 'react'

import { storageUrl } from '../images.ts'
import { createServerSupabase } from '../supabase/server.ts'

export interface ProductImage {
  storagePath: string
  url: string
  alt: string
}

export interface ProductOptionValue {
  id: string
  value: string
  hex: string | null
}

export interface ProductOption {
  id: string
  name: string
  values: ProductOptionValue[]
}

export interface ProductVariant {
  id: string
  title: string
  sku: string
  priceCents: number
  compareAtPriceCents: number | null
  available: number
  /** Ids de valor de opción que definen esta combinación (talla, color…). */
  optionValueIds: string[]
}

export interface ProductRating {
  average: number
  count: number
  distribution: { stars: number; count: number; percent: number }[]
}

export interface ProductReview {
  id: string
  authorName: string
  rating: number
  title: string | null
  body: string
  createdAt: string
  isVerified: boolean
}

export interface ProductDetail {
  id: string
  slug: string
  name: string
  shortDescription: string | null
  longDescription: string | null
  /** "La modelo mide 1.75 m y usa talla S." — evita devoluciones por talla. */
  fitNote: string | null
  /** Composición, un renglón por material. Vacío = no se capturó. */
  materials: string[]
  /** Cuidados, un renglón por indicación. Vacío = no se capturó. */
  care: string[]
  brand: string | null
  seoTitle: string | null
  seoDescription: string | null
  images: ProductImage[]
  options: ProductOption[]
  variants: ProductVariant[]
  categoryName: string | null
  categorySlug: string | null
  collectionName: string | null
  /** SKU de la variante más barata: el que enseña la cabecera de la ficha. */
  displaySku: string
  priceFromCents: number
  compareAtFromCents: number | null
  totalAvailable: number
  rating: ProductRating | null
  reviews: ProductReview[]
}

/**
 * Ficha de producto completa en una sola consulta anidada.
 *
 * Se lee con RLS activa (no por RPC): las políticas del catálogo ya limitan lo
 * visible a lo publicado, y aquí no hay ninguna regla de negocio que proteger
 * —solo lectura—.
 */
export const getProduct = cache(async (slug: string): Promise<ProductDetail | null> => {
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('products')
    .select(
      `
      id, slug, name, short_description, long_description, fit_note, materials, care, brand,
      seo_title, seo_description,
      product_images ( storage_path, alt_text, position ),
      product_options ( id, name, position,
        product_option_values ( id, value, hex, position )
      ),
      product_variants (
        id, title, sku, price_cents, compare_at_price_cents, is_active, position,
        variant_option_values ( option_value_id ),
        inventory_levels ( available )
      ),
      categories!products_primary_category_id_fkey ( name, slug ),
      product_collections ( collections ( name ) )
    `,
    )
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    console.error('[producto] consulta falló:', error.message)
    return null
  }
  if (!data) return null

  const images: ProductImage[] = [...(data.product_images ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((i) => ({
      storagePath: i.storage_path,
      url: storageUrl(i.storage_path),
      alt: i.alt_text || data.name,
    }))

  const options: ProductOption[] = [...(data.product_options ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((o) => ({
      id: o.id,
      name: o.name,
      values: [...(o.product_option_values ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((v) => ({ id: v.id, value: v.value, hex: v.hex })),
    }))

  const variants: ProductVariant[] = [...(data.product_variants ?? [])]
    .filter((v) => v.is_active)
    .sort((a, b) => a.position - b.position)
    .map((v) => ({
      id: v.id,
      title: v.title,
      sku: v.sku,
      priceCents: v.price_cents,
      compareAtPriceCents: v.compare_at_price_cents,
      // Hoy hay una sucursal; al abrir la segunda esto pasará a filtrar por la
      // que sirve los pedidos en línea.
      available: (v.inventory_levels ?? []).reduce((sum, il) => sum + (il.available ?? 0), 0),
      optionValueIds: (v.variant_option_values ?? []).map((vov) => vov.option_value_id),
    }))

  if (variants.length === 0) return null

  const cheapest = variants.reduce((min, v) => (v.priceCents < min.priceCents ? v : min))

  const [rating, reviews] = await Promise.all([
    getProductRating(data.id),
    getProductReviews(data.id),
  ])

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    shortDescription: data.short_description,
    longDescription: data.long_description,
    fitNote: data.fit_note,
    materials: renglones(data.materials),
    care: renglones(data.care),
    brand: data.brand,
    seoTitle: data.seo_title,
    seoDescription: data.seo_description,
    images,
    options,
    variants,
    categoryName: data.categories?.name ?? null,
    categorySlug: data.categories?.slug ?? null,
    collectionName: data.product_collections?.[0]?.collections?.name ?? null,
    displaySku: cheapest.sku,
    priceFromCents: cheapest.priceCents,
    compareAtFromCents: cheapest.compareAtPriceCents,
    totalAvailable: variants.reduce((sum, v) => sum + v.available, 0),
    rating,
    reviews,
  }
})

async function getProductRating(productId: string): Promise<ProductRating | null> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('v_product_ratings')
    .select('*')
    .eq('product_id', productId)
    .maybeSingle()

  if (!data || !data.reviews_count) return null

  const total = data.reviews_count
  const buckets = [
    { stars: 5, count: data.five_star ?? 0 },
    { stars: 4, count: data.four_star ?? 0 },
    { stars: 3, count: data.three_star ?? 0 },
    { stars: 2, count: data.two_star ?? 0 },
    { stars: 1, count: data.one_star ?? 0 },
  ]

  return {
    average: Number(data.average_rating ?? 0),
    count: total,
    distribution: buckets.map((b) => ({
      ...b,
      percent: total > 0 ? Math.round((b.count / total) * 100) : 0,
    })),
  }
}

async function getProductReviews(productId: string): Promise<ProductReview[]> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('product_reviews')
    .select('id, author_name, rating, title, body, created_at, order_id')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(5)

  return (data ?? []).map((r) => ({
    id: r.id,
    authorName: r.author_name,
    rating: r.rating,
    title: r.title,
    body: r.body,
    createdAt: r.created_at,
    // El sello no lo escribe quien reseña: lo respalda un pedido real.
    isVerified: r.order_id !== null,
  }))
}

/** Texto de un campo multilínea a renglones, sin vacíos. */
function renglones(texto: string | null): string[] {
  return (texto ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
}
