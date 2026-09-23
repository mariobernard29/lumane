'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import type { Json } from '@lumane/db'

import { createServerSupabase } from '@/lib/supabase/server'
import type { ResultadoAdmin } from './contenido.ts'

/**
 * La portada: el hero y los cinco bloques.
 *
 * Los bloques viven en `page_sections` desde la migración 0053, que los sacó
 * del JSX. Esta es la pantalla que los edita.
 *
 * **Lo editable de un bloque son sus textos, su orden y su límite.** El TIPO no
 * se toca: decide qué renderizador lo pinta, y cambiarlo a mano dejaría la
 * sección invisible —el sitio descarta en silencio los tipos que no conoce—
 * sin ninguna pista de por qué.
 */

function texto(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

const seccionSchema = z.object({
  id: z.string().uuid(),
  eyebrow: z.string().nullable(),
  title: z.string().nullable(),
  subtitle: z.string().nullable(),
  linkLabel: z.string().nullable(),
  linkHref: z.string().nullable(),
  limite: z.number().int().min(1).max(24).nullable(),
  isActive: z.boolean(),
})

export async function guardarSeccion(formData: FormData): Promise<ResultadoAdmin> {
  const crudo = formData.get('limite')
  const parsed = seccionSchema.safeParse({
    id: formData.get('id'),
    eyebrow: texto(formData.get('eyebrow')),
    title: texto(formData.get('title')),
    subtitle: texto(formData.get('subtitle')),
    linkLabel: texto(formData.get('linkLabel')),
    linkHref: texto(formData.get('linkHref')),
    limite: crudo && String(crudo).trim() !== '' ? Number(crudo) : null,
    isActive: formData.get('isActive') === 'on',
  })

  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0]?.message ?? 'Revisa los datos' }
  }
  const d = parsed.data

  const supabase = await createServerSupabase()

  // El `config` se FUSIONA, no se reemplaza: lleva claves que esta pantalla no
  // enseña —`anchor`, `stagger`, `tone`, `cta_icon`— y sobrescribirlo entero
  // las borraría. El ancla es lo que hace funcionar el enlace «Nuestra casa»
  // del menú; perderla rompería la navegación sin que nadie lo relacione.
  const { data: previa, error: eLectura } = await supabase
    .from('page_sections')
    .select('config')
    .eq('id', d.id)
    .maybeSingle()

  if (eLectura) return { ok: false, mensaje: eLectura.message }

  const config = { ...((previa?.config as Record<string, unknown>) ?? {}) }
  if (d.linkLabel === null) delete config.link_label
  else config.link_label = d.linkLabel
  if (d.linkHref === null) delete config.link_href
  else config.link_href = d.linkHref
  if (d.limite === null) delete config.limit
  else config.limit = d.limite

  // `about_split` guarda su enlace en `cta_*` y no en `link_*`: el formulario
  // usa los mismos dos campos para las dos formas, y aquí se reparte.
  if ('cta_label' in config || 'cta_href' in config) {
    if (d.linkLabel === null) delete config.cta_label
    else config.cta_label = d.linkLabel
    if (d.linkHref === null) delete config.cta_href
    else config.cta_href = d.linkHref
    delete config.link_label
    delete config.link_href
  }

  const { data, error } = await supabase
    .from('page_sections')
    .update({
      eyebrow: d.eyebrow,
      title: d.title,
      subtitle: d.subtitle,
      // `config` es jsonb y los tipos generados lo exponen como `Json`. El
      // objeto que se arma arriba es un mapa de claves conocidas, así que la
      // conversión es exacta y no un escape del tipado.
      config: config as Json,
      is_active: d.isActive,
    })
    .eq('id', d.id)
    .select('id')

  if (error) return { ok: false, mensaje: error.message }
  if (!data?.length) return { ok: false, mensaje: 'No tienes permiso para editar la portada.' }

  revalidatePath('/', 'layout')
  return { ok: true, mensaje: 'Bloque guardado.' }
}

/** Intercambia la posición con el bloque vecino. Mismo criterio que en menús. */
export async function moverSeccion(
  id: string,
  direccion: 'arriba' | 'abajo',
): Promise<ResultadoAdmin> {
  const supabase = await createServerSupabase()

  const { data: actual } = await supabase
    .from('page_sections')
    .select('id, page_key, position')
    .eq('id', id)
    .single()

  if (!actual) return { ok: false, mensaje: 'No encontramos ese bloque' }

  const { data: vecino } = await supabase
    .from('page_sections')
    .select('id, position')
    .eq('page_key', actual.page_key)
    .order('position', { ascending: direccion === 'abajo' })
    [direccion === 'abajo' ? 'gt' : 'lt']('position', actual.position)
    .limit(1)
    .maybeSingle()

  if (!vecino) return { ok: true, mensaje: '' }

  const [a, b] = await Promise.all([
    supabase.from('page_sections').update({ position: vecino.position }).eq('id', actual.id).select('id'),
    supabase.from('page_sections').update({ position: actual.position }).eq('id', vecino.id).select('id'),
  ])

  if (a.error || b.error) return { ok: false, mensaje: a.error?.message ?? b.error!.message }
  if (!a.data?.length || !b.data?.length) {
    return { ok: false, mensaje: 'No tienes permiso para reordenar la portada.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, mensaje: '' }
}

const heroSchema = z.object({
  id: z.string().uuid(),
  eyebrow: z.string().nullable(),
  title: z.string().nullable(),
  subtitle: z.string().nullable(),
  imageAlt: z.string().min(3, 'Describe la imagen para quien no la ve'),
  ctaLabel: z.string().nullable(),
  ctaHref: z.string().nullable(),
  secondaryCtaLabel: z.string().nullable(),
  secondaryCtaHref: z.string().nullable(),
  isActive: z.boolean(),
})

export async function guardarHero(formData: FormData): Promise<ResultadoAdmin> {
  const parsed = heroSchema.safeParse({
    id: formData.get('id'),
    eyebrow: texto(formData.get('eyebrow')),
    title: texto(formData.get('title')),
    subtitle: texto(formData.get('subtitle')),
    imageAlt: (formData.get('imageAlt') as string)?.trim(),
    ctaLabel: texto(formData.get('ctaLabel')),
    ctaHref: texto(formData.get('ctaHref')),
    secondaryCtaLabel: texto(formData.get('secondaryCtaLabel')),
    secondaryCtaHref: texto(formData.get('secondaryCtaHref')),
    isActive: formData.get('isActive') === 'on',
  })

  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0]?.message ?? 'Revisa los datos' }
  }
  const d = parsed.data

  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('hero_slides')
    .update({
      eyebrow: d.eyebrow,
      title: d.title,
      subtitle: d.subtitle,
      image_alt: d.imageAlt,
      cta_label: d.ctaLabel,
      cta_href: d.ctaHref,
      secondary_cta_label: d.secondaryCtaLabel,
      secondary_cta_href: d.secondaryCtaHref,
      is_active: d.isActive,
    })
    .eq('id', d.id)
    .select('id')

  if (error) return { ok: false, mensaje: error.message }
  if (!data?.length) return { ok: false, mensaje: 'No tienes permiso para editar la portada.' }

  revalidatePath('/', 'layout')
  return { ok: true, mensaje: 'Portada guardada.' }
}

/** La imagen del hero se sube aparte; esto solo guarda su ruta. */
export async function guardarImagenHero(id: string, path: string): Promise<ResultadoAdmin> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('hero_slides')
    .update({ image_path: path })
    .eq('id', id)
    .select('id')

  if (error) return { ok: false, mensaje: error.message }
  if (!data?.length) return { ok: false, mensaje: 'No tienes permiso para editar la portada.' }

  revalidatePath('/', 'layout')
  return { ok: true, mensaje: 'Imagen actualizada.' }
}
