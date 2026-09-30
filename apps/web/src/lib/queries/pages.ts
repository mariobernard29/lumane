import { cache } from 'react'

import { BUCKETS } from '@lumane/db'

import { storageUrl } from '../images.ts'
import { createServerSupabase } from '../supabase/server.ts'

/**
 * Las plantillas que sabe pintar `/p/[slug]`.
 *
 * Es la misma lista que la restricción `pages_template_is_known` de la base.
 * Tenía todavía `size_guide`, que la migración 0054 quitó del CHECK: un valor
 * que el tipo admite y la base rechaza no da error aquí, pero hace creer que
 * existe una plantilla que no se puede guardar.
 */
export type PageTemplate = 'prose' | 'faq' | 'contact' | 'store'

/** Una foto de la boutique. Salen de `hero_slides` con `page_key = 'boutique'`. */
export interface StorePhoto {
  id: string
  url: string
  alt: string | null
}

export interface ContentPage {
  slug: string
  title: string
  excerpt: string | null
  body: string | null
  template: PageTemplate
  seoTitle: string | null
  seoDescription: string | null
  updatedAt: string
}

export interface FaqGroup {
  category: string
  items: { id: string; question: string; answer: string }[]
}

/**
 * Una página de contenido.
 *
 * La política `pages_public_read` solo deja ver las publicadas, así que una
 * página en borrador devuelve null aquí y la ruta responde 404. No hace falta
 * filtrar por `is_published` en la consulta: la base ya lo hace.
 */
export const getPage = cache(async (slug: string): Promise<ContentPage | null> => {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('pages')
    .select('slug, title, excerpt, body, template, seo_title, seo_description, updated_at')
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    console.error('[pagina] consulta falló:', error.message)
    return null
  }
  if (!data) return null

  return {
    slug: data.slug,
    title: data.title,
    excerpt: data.excerpt,
    body: data.body,
    template: data.template as PageTemplate,
    seoTitle: data.seo_title,
    seoDescription: data.seo_description,
    updatedAt: data.updated_at,
  }
})

/** Todas las páginas publicadas, para el sitemap. */
export const getPublishedPageSlugs = cache(async (): Promise<string[]> => {
  const supabase = await createServerSupabase()
  const { data } = await supabase.from('pages').select('slug').order('position')
  return (data ?? []).map((p) => p.slug)
})

/**
 * Preguntas frecuentes agrupadas por categoría.
 *
 * El orden de las categorías lo marca la primera pregunta de cada una: así la
 * boutique reordena todo moviendo `position`, sin una tabla aparte de
 * categorías que habría que mantener en paralelo.
 */
export const getFaqGroups = cache(async (): Promise<FaqGroup[]> => {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('faqs')
    .select('id, category, question, answer, position')
    .order('position')

  const groups = new Map<string, FaqGroup>()
  for (const faq of data ?? []) {
    const key = faq.category ?? 'General'
    if (!groups.has(key)) groups.set(key, { category: key, items: [] })
    groups.get(key)!.items.push({ id: faq.id, question: faq.question, answer: faq.answer })
  }

  return [...groups.values()]
})

/**
 * Las fotos del local.
 *
 * Viven en `hero_slides` con `page_key = 'boutique'` en vez de en una tabla
 * nueva: ya es la tabla de imágenes con pie de foto, ya tiene orden, ventana
 * de fechas y su política de lectura pública, y reutilizarla significa que la
 * galería se administra desde el panel sin inventar nada.
 *
 * Devuelve `[]` mientras no haya ninguna, y la página no pinta la galería. Una
 * retícula de huecos grises se ve peor que no tener fotos.
 */
export const getStorePhotos = cache(async (): Promise<StorePhoto[]> => {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('hero_slides')
    .select('id, image_path, image_alt')
    .eq('page_key', 'boutique')
    .order('position')

  return (data ?? [])
    // Una fila sin imagen es una que la propietaria empezó y no terminó de
    // subir: se salta en lugar de pintar el marcador de posición.
    .filter((f) => Boolean(f.image_path))
    .map((f) => ({
      id: f.id,
      url: storageUrl(f.image_path, BUCKETS.content),
      alt: f.image_alt,
    }))
})
