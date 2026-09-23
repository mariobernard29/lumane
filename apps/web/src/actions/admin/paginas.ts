'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createServerSupabase } from '@/lib/supabase/server'
import type { ResultadoAdmin } from './contenido.ts'

/**
 * Páginas de contenido y preguntas frecuentes.
 *
 * El cuerpo de una página es **Markdown**, y se sanea al pintarlo con una
 * lista blanca estricta (`lib/markdown.ts`). Esa lista NO incluye `img`, así
 * que una imagen escrita como `![](…)` desaparece al guardar la página en el
 * navegador de quien la lee. No se amplía: es superficie de XSS real, y una
 * página que necesita una imagen es una `page_section`, no Markdown.
 */

function texto(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

const paginaSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(2, 'La página necesita un título'),
  slug: z
    .string()
    .min(2, 'La dirección no puede quedar vacía')
    .regex(/^[a-z0-9-]+$/, 'La dirección solo admite minúsculas, números y guiones'),
  excerpt: z.string().nullable(),
  body: z.string().nullable(),
  template: z.enum(['prose', 'faq', 'contact']),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  isPublished: z.boolean(),
})

export async function guardarPagina(formData: FormData): Promise<ResultadoAdmin> {
  const parsed = paginaSchema.safeParse({
    id: formData.get('id'),
    title: (formData.get('title') as string)?.trim(),
    slug: (formData.get('slug') as string)?.trim().toLowerCase(),
    excerpt: texto(formData.get('excerpt')),
    // El cuerpo NO se recorta con trim: en Markdown, dos saltos de línea al
    // final de un párrafo son significativos mientras se edita.
    body: (formData.get('body') as string) || null,
    template: formData.get('template'),
    seoTitle: texto(formData.get('seoTitle')),
    seoDescription: texto(formData.get('seoDescription')),
    isPublished: formData.get('isPublished') === 'on',
  })

  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0]?.message ?? 'Revisa los datos' }
  }
  const d = parsed.data

  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('pages')
    .update({
      title: d.title,
      slug: d.slug,
      excerpt: d.excerpt,
      body: d.body,
      template: d.template,
      seo_title: d.seoTitle,
      seo_description: d.seoDescription,
      is_published: d.isPublished,
    })
    .eq('id', d.id)
    .select('id')

  if (error) {
    if (error.code === '23505') {
      return { ok: false, mensaje: `Ya hay otra página en la dirección «${d.slug}».` }
    }
    if (error.code === '23514') {
      return { ok: false, mensaje: 'Esa plantilla no existe. Elige prosa, contacto o preguntas.' }
    }
    return { ok: false, mensaje: error.message }
  }
  if (!data?.length) return { ok: false, mensaje: 'No tienes permiso para editar las páginas.' }

  revalidatePath('/', 'layout')
  return { ok: true, mensaje: 'Página guardada.' }
}

const preguntaSchema = z.object({
  id: z.string().uuid().optional(),
  question: z.string().min(3, 'La pregunta no puede quedar vacía'),
  answer: z.string().min(3, 'La respuesta no puede quedar vacía'),
  category: z.string().min(1, 'Elige o escribe una categoría'),
  position: z.number().int().min(0),
  isVisible: z.boolean(),
})

export async function guardarPregunta(formData: FormData): Promise<ResultadoAdmin> {
  const parsed = preguntaSchema.safeParse({
    id: (formData.get('id') as string) || undefined,
    question: (formData.get('question') as string)?.trim(),
    answer: (formData.get('answer') as string) || '',
    category: (formData.get('category') as string)?.trim(),
    position: Number(formData.get('position') ?? 0),
    isVisible: formData.get('isVisible') === 'on',
  })

  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0]?.message ?? 'Revisa los datos' }
  }
  const d = parsed.data

  const fila = {
    question: d.question,
    answer: d.answer,
    category: d.category,
    position: d.position,
    is_visible: d.isVisible,
  }

  const supabase = await createServerSupabase()
  const { data, error } = d.id
    ? await supabase.from('faqs').update(fila).eq('id', d.id).select('id')
    : await supabase.from('faqs').insert(fila).select('id')

  if (error) return { ok: false, mensaje: error.message }
  if (!data?.length) return { ok: false, mensaje: 'No tienes permiso para editar las preguntas.' }

  revalidatePath('/', 'layout')
  return { ok: true, mensaje: d.id ? 'Pregunta guardada.' : 'Pregunta añadida.' }
}

export async function borrarPregunta(id: string): Promise<ResultadoAdmin> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.from('faqs').delete().eq('id', id).select('id')

  if (error) return { ok: false, mensaje: error.message }
  if (!data?.length) return { ok: false, mensaje: 'No tienes permiso para borrar preguntas.' }

  revalidatePath('/', 'layout')
  return { ok: true, mensaje: 'Pregunta borrada.' }
}

/**
 * Mover una pregunta dentro de SU categoría.
 *
 * El orden de las categorías lo marca la primera pregunta de cada una
 * (`lib/queries/pages.ts`), así que mover una pregunta entre vecinas de otra
 * categoría reordenaría los grupos sin que nadie lo pidiera.
 */
export async function moverPregunta(
  id: string,
  direccion: 'arriba' | 'abajo',
): Promise<ResultadoAdmin> {
  const supabase = await createServerSupabase()

  const { data: actual } = await supabase
    .from('faqs')
    .select('id, category, position')
    .eq('id', id)
    .single()

  if (!actual) return { ok: false, mensaje: 'No encontramos esa pregunta' }

  // `category` admite nulos en el esquema, y `.eq(columna, null)` no compara
  // con NULL en SQL: hay que usar `is`. Una pregunta sin categoría se mueve
  // entre las otras sin categoría, que es lo coherente con cómo se agrupan.
  const base = supabase.from('faqs').select('id, position')
  const porCategoria =
    actual.category === null ? base.is('category', null) : base.eq('category', actual.category)

  const { data: vecina } = await porCategoria
    .order('position', { ascending: direccion === 'abajo' })
    [direccion === 'abajo' ? 'gt' : 'lt']('position', actual.position)
    .limit(1)
    .maybeSingle()

  if (!vecina) return { ok: true, mensaje: '' }

  const [a, b] = await Promise.all([
    supabase.from('faqs').update({ position: vecina.position }).eq('id', actual.id).select('id'),
    supabase.from('faqs').update({ position: actual.position }).eq('id', vecina.id).select('id'),
  ])

  if (a.error || b.error) return { ok: false, mensaje: a.error?.message ?? b.error!.message }
  if (!a.data?.length || !b.data?.length) {
    return { ok: false, mensaje: 'No tienes permiso para reordenar las preguntas.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, mensaje: '' }
}
