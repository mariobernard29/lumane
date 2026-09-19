import { cache } from 'react'
import { BUCKETS } from '@lumane/db'

import { storageUrl } from '../images.ts'
import { createServerSupabase } from '../supabase/server.ts'

export interface Collection {
  id: string
  name: string
  slug: string
  description: string | null
  badge: string | null
  imageUrl: string
  imageAlt: string
  /** Fotografía ancha del encabezado. Tenerla es lo que hace destacada a una colección. */
  bannerUrl: string | null
  bannerAlt: string
  productCount: number
  seoTitle: string | null
  seoDescription: string | null
}

/**
 * La vista `v_public_collections` ya filtra las visibles y cuenta solo las
 * piezas publicadas, así que el número de la tarjeta es el mismo que la
 * clienta encontrará al entrar. Al ser una vista, los tipos generados dan todo
 * como nullable; aquí se normaliza una vez para que las páginas no arrastren
 * comprobaciones que la base ya garantiza.
 */
function toCollection(row: {
  id: string | null
  name: string | null
  slug: string | null
  description: string | null
  badge_label: string | null
  image_path: string | null
  image_alt: string | null
  banner_path: string | null
  banner_alt: string | null
  product_count: number | null
  seo_title: string | null
  seo_description: string | null
}): Collection {
  const name = row.name ?? ''
  const imageAlt = row.image_alt ?? `Fotografía de la colección ${name}`

  return {
    id: row.id ?? '',
    name,
    slug: row.slug ?? '',
    description: row.description,
    badge: row.badge_label,
    imageUrl: storageUrl(row.image_path, BUCKETS.content),
    imageAlt,
    bannerUrl: row.banner_path ? storageUrl(row.banner_path, BUCKETS.content) : null,
    // El banner es otra fotografía distinta a la de la tarjeta. Si nadie le ha
    // escrito su propio alt, el de la tarjeta describe mal pero describe algo;
    // callarse sería peor para quien navega con lector de pantalla.
    bannerAlt: row.banner_alt ?? imageAlt,
    productCount: row.product_count ?? 0,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
  }
}

const SELECT =
  'id, name, slug, description, badge_label, image_path, image_alt, banner_path, banner_alt, product_count, seo_title, seo_description'

export const getCollections = cache(async (): Promise<Collection[]> => {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('v_public_collections')
    .select(SELECT)
    .order('position')

  if (error) {
    // Una colección que no carga y una tienda sin colecciones se ven igual en
    // pantalla. La traza es lo único que distingue el fallo del vacío.
    console.error('[colecciones] no se pudieron leer:', error.message)
    return []
  }

  return (data ?? []).map(toCollection)
})

export const getCollection = cache(async (slug: string): Promise<Collection | null> => {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('v_public_collections')
    .select(SELECT)
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    console.error(`[colecciones] fallo al leer "${slug}":`, error.message)
    return null
  }

  return data ? toCollection(data) : null
})
