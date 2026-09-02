import { cache } from 'react'
import { BUCKETS } from '@lumane/db'

import { storageUrl } from '../images.ts'
import { createServerSupabase } from '../supabase/server.ts'

export interface HeroData {
  imageUrl: string
  imageAlt: string
  eyebrow: string | null
  title: string
  subtitle: string | null
  ctaLabel: string | null
  ctaHref: string | null
  secondaryCtaLabel: string | null
  secondaryCtaHref: string | null
}

/**
 * Portada. La política RLS `hero_slides_public_read` ya filtra por `is_active`
 * y por la ventana de fechas, así que una portada de temporada se publica y se
 * retira sola sin que nadie tenga que acordarse.
 */
export const getHero = cache(async (pageKey = 'home'): Promise<HeroData | null> => {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('hero_slides')
    .select('*')
    .eq('page_key', pageKey)
    .order('position')
    .limit(1)
    .maybeSingle()

  if (!data) return null

  return {
    imageUrl: storageUrl(data.image_path, BUCKETS.content),
    imageAlt: data.image_alt,
    eyebrow: data.eyebrow,
    title: data.title ?? '',
    subtitle: data.subtitle,
    ctaLabel: data.cta_label,
    ctaHref: data.cta_href,
    secondaryCtaLabel: data.secondary_cta_label,
    secondaryCtaHref: data.secondary_cta_href,
  }
})

export interface CategoryTile {
  id: string
  name: string
  slug: string
  imageUrl: string
  imageAlt: string
}

export const getCategoryTiles = cache(async (limit = 4): Promise<CategoryTile[]> => {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('categories')
    .select('id, name, slug, image_path, image_alt')
    .is('parent_id', null)
    .not('image_path', 'is', null)
    .order('position')
    .limit(limit)

  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    imageUrl: storageUrl(c.image_path, BUCKETS.content),
    // Si falta el alt, es preferible un texto genérico a ninguno; el
    // administrador debería llenarlo, pero el sitio no puede quedarse mudo.
    imageAlt: c.image_alt ?? `Fotografía de la categoría ${c.name}`,
  }))
})

export interface CollectionTile {
  id: string
  name: string
  slug: string
  description: string | null
  badge: string | null
  imageUrl: string
  imageAlt: string
}

export const getCollectionTiles = cache(async (limit = 4): Promise<CollectionTile[]> => {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('collections')
    .select('id, name, slug, description, badge_label, image_path, image_alt')
    .order('position')
    .limit(limit)

  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    badge: c.badge_label,
    imageUrl: storageUrl(c.image_path, BUCKETS.content),
    imageAlt: c.image_alt ?? `Fotografía de la colección ${c.name}`,
  }))
})

export interface HomeSection {
  id: string
  type: string
  eyebrow: string | null
  title: string | null
  subtitle: string | null
  config: Record<string, unknown>
}

/**
 * Las secciones de la portada y su orden viven en la base. Cambiar el orden o
 * apagar un bloque es mover una fila desde el POS, no desplegar código.
 */
export const getPageSections = cache(async (pageKey = 'home'): Promise<HomeSection[]> => {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('page_sections')
    .select('id, type, eyebrow, title, subtitle, config')
    .eq('page_key', pageKey)
    .order('position')

  return (data ?? []).map((s) => ({
    id: s.id,
    type: s.type,
    eyebrow: s.eyebrow,
    title: s.title,
    subtitle: s.subtitle,
    config: (s.config as Record<string, unknown>) ?? {},
  }))
})

export interface ServicesBarItem {
  icon: string
  label: string
}

/** La franja negra de servicios bajo la portada. */
export const getServices = cache(async (): Promise<ServicesBarItem[]> => {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('banners')
    .select('title, cta_label, position')
    .eq('slot_key', 'services')
    .order('position')

  return (data ?? []).map((b) => ({
    // `cta_label` guarda el nombre del glifo de Material Symbols.
    icon: b.cta_label ?? 'check',
    label: b.title ?? '',
  }))
})
