import { cache } from 'react'

import { createServerSupabase } from '../supabase/server.ts'

export type PageTemplate = 'prose' | 'faq' | 'contact' | 'size_guide'

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
