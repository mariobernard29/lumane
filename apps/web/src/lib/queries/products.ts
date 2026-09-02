import { cache } from 'react'

import { storageUrl } from '../images.ts'
import { createServerSupabase } from '../supabase/server.ts'

/** Lo mínimo que necesita una `ProductCard`. Nada más viaja al navegador. */
export interface ProductCardData {
  id: string
  slug: string
  name: string
  subtitle: string | null
  imageUrl: string
  imageAlt: string
  priceCents: number
  compareAtPriceCents: number | null
  labels: string[]
}

/**
 * La consulta del catálogo.
 *
 * Un producto tiene varias variantes con precios que pueden diferir; la
 * tarjeta muestra el MÁS BAJO ("desde"), que es lo que espera quien compra y
 * lo que hace el prototipo. El precio anterior solo se pinta si corresponde a
 * esa misma variante: mezclar el precio de una talla con el descuento de otra
 * daría un porcentaje falso.
 */
const SELECT = `
  id, slug, name, short_description, published_at,
  product_variants ( price_cents, compare_at_price_cents, is_active ),
  product_images ( storage_path, alt_text, position )
` as const

type Raw = {
  id: string
  slug: string
  name: string
  short_description: string | null
  published_at: string | null
  product_variants: {
    price_cents: number
    compare_at_price_cents: number | null
    is_active: boolean
  }[]
  product_images: { storage_path: string; alt_text: string; position: number }[]
}

function toCard(row: Raw): ProductCardData | null {
  const active = row.product_variants.filter((v) => v.is_active)
  if (active.length === 0) return null

  const cheapest = active.reduce((min, v) => (v.price_cents < min.price_cents ? v : min))
  const image = [...row.product_images].sort((a, b) => a.position - b.position)[0]

  const labels: string[] = []
  // "Últimas piezas" y "Edición limitada" llegarán de `tags` cuando el
  // administrador los asigne; el badge de descuento lo calcula la tarjeta sola.

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    subtitle: row.short_description,
    imageUrl: storageUrl(image?.storage_path),
    imageAlt: image?.alt_text || row.name,
    priceCents: cheapest.price_cents,
    compareAtPriceCents: cheapest.compare_at_price_cents,
    labels,
  }
}

/** Novedades: lo último publicado. */
export const getNewArrivals = cache(async (limit = 4): Promise<ProductCardData[]> => {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('products')
    .select(SELECT)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)

  return ((data ?? []) as Raw[]).map(toCard).filter((c): c is ProductCardData => c !== null)
})

/**
 * Piezas rebajadas. El filtro real es "alguna variante tiene precio anterior";
 * PostgREST no lo expresa sobre la tabla hija, así que se traen las candidatas
 * y se descartan aquí. Con el catálogo de una boutique es irrelevante; si un
 * día crece, se convierte en una vista con índice.
 */
export const getOnSale = cache(async (limit = 9): Promise<ProductCardData[]> => {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('products')
    .select(SELECT)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(60)

  return ((data ?? []) as Raw[])
    .map(toCard)
    .filter((c): c is ProductCardData => c !== null && c.compareAtPriceCents !== null)
    .slice(0, limit)
})
