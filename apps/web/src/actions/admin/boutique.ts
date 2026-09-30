'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createServerSupabase } from '@/lib/supabase/server'
import type { ResultadoAdmin } from './contenido.ts'

/**
 * Las fotos del local.
 *
 * Se guardan en `hero_slides` con `page_key = 'boutique'`. No es un atajo: esa
 * tabla ya es «una imagen con pie de foto, ordenada y con ventana de fechas»,
 * que es exactamente lo que hace falta. Una tabla nueva habría traído su
 * migración, sus políticas RLS y su propio editor para no ganar nada.
 *
 * Como en el resto del panel, **cada escritura lleva `.select()`**. Sin
 * permiso `cms.write` la RLS no lanza error: filtra la fila y el `update`
 * afecta a cero filas en silencio. Sin el `select`, la propietaria vería
 * «Guardado» sin haber guardado nada.
 */

const PAGE_KEY = 'boutique'

/** Crea el hueco. La imagen se sube después, ya con una fila a la que colgarla. */
export async function agregarFoto(): Promise<ResultadoAdmin> {
  const supabase = await createServerSupabase()

  const { data: ultima } = await supabase
    .from('hero_slides')
    .select('position')
    .eq('page_key', PAGE_KEY)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabase
    .from('hero_slides')
    .insert({
      page_key: PAGE_KEY,
      // `image_path` es obligatorio en la tabla y todavía no hay archivo. La
      // cadena vacía marca «pendiente de subir»: `getStorePhotos` la descarta,
      // así que un hueco a medias nunca llega a la tienda.
      image_path: '',
      image_alt: '',
      position: (ultima?.position ?? 0) + 1,
      is_active: true,
    })
    .select('id')

  if (error) return { ok: false, mensaje: error.message }
  if (!data?.length) return { ok: false, mensaje: 'No tienes permiso para editar la boutique.' }

  revalidatePath('/admin/boutique')
  revalidatePath('/p/la-boutique')
  return { ok: true, mensaje: 'Hueco añadido. Sube la foto.' }
}

const fotoSchema = z.object({
  id: z.string().uuid(),
  imageAlt: z.string().min(3, 'Describe la foto para quien no la ve'),
})

export async function guardarFoto(formData: FormData): Promise<ResultadoAdmin> {
  const parsed = fotoSchema.safeParse({
    id: formData.get('id'),
    imageAlt: (formData.get('imageAlt') as string)?.trim(),
  })

  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0]?.message ?? 'Revisa los datos' }
  }
  const d = parsed.data

  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('hero_slides')
    .update({ image_alt: d.imageAlt })
    .eq('id', d.id)
    .eq('page_key', PAGE_KEY)
    .select('id')

  if (error) return { ok: false, mensaje: error.message }
  if (!data?.length) return { ok: false, mensaje: 'No tienes permiso para editar la boutique.' }

  revalidatePath('/admin/boutique')
  revalidatePath('/p/la-boutique')
  return { ok: true, mensaje: 'Foto guardada.' }
}

export async function guardarImagenFoto(id: string, path: string): Promise<ResultadoAdmin> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('hero_slides')
    .update({ image_path: path })
    .eq('id', id)
    .eq('page_key', PAGE_KEY)
    .select('id')

  if (error) return { ok: false, mensaje: error.message }
  if (!data?.length) return { ok: false, mensaje: 'No tienes permiso para editar la boutique.' }

  revalidatePath('/admin/boutique')
  revalidatePath('/p/la-boutique')
  return { ok: true, mensaje: 'Foto subida.' }
}

export async function quitarFoto(formData: FormData): Promise<ResultadoAdmin> {
  const id = formData.get('id')
  if (typeof id !== 'string') return { ok: false, mensaje: 'Falta la foto' }

  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('hero_slides')
    .delete()
    .eq('id', id)
    .eq('page_key', PAGE_KEY)
    .select('id')

  if (error) return { ok: false, mensaje: error.message }
  if (!data?.length) return { ok: false, mensaje: 'No tienes permiso para editar la boutique.' }

  // El archivo se queda en Storage a propósito. Borrarlo aquí destruiría la
  // imagen para siempre por un clic en «Quitar», y el coste de dejarla es unos
  // kilobytes. Si estorban, se limpian desde Storage a conciencia.
  revalidatePath('/admin/boutique')
  revalidatePath('/p/la-boutique')
  return { ok: true, mensaje: 'Foto quitada.' }
}

/** Sube o baja una foto en la galería. Mismo patrón que los bloques de portada. */
export async function moverFoto(formData: FormData): Promise<ResultadoAdmin> {
  const id = formData.get('id')
  const direccion = formData.get('direccion')
  if (typeof id !== 'string' || (direccion !== 'arriba' && direccion !== 'abajo')) {
    return { ok: false, mensaje: 'Movimiento no válido' }
  }

  const supabase = await createServerSupabase()
  const { data: fotos } = await supabase
    .from('hero_slides')
    .select('id, position')
    .eq('page_key', PAGE_KEY)
    .order('position')

  const lista = fotos ?? []
  const i = lista.findIndex((f) => f.id === id)
  if (i === -1) return { ok: false, mensaje: 'Esa foto ya no está' }

  const j = direccion === 'arriba' ? i - 1 : i + 1
  if (j < 0 || j >= lista.length) return { ok: true, mensaje: 'Ya está en el extremo.' }

  const actual = lista[i]!
  const vecino = lista[j]!

  const [a, b] = await Promise.all([
    supabase.from('hero_slides').update({ position: vecino.position }).eq('id', actual.id).select('id'),
    supabase.from('hero_slides').update({ position: actual.position }).eq('id', vecino.id).select('id'),
  ])

  if (a.error || b.error) return { ok: false, mensaje: a.error?.message ?? b.error!.message }
  if (!a.data?.length || !b.data?.length) {
    return { ok: false, mensaje: 'No tienes permiso para editar la boutique.' }
  }

  revalidatePath('/admin/boutique')
  revalidatePath('/p/la-boutique')
  return { ok: true, mensaje: 'Orden actualizado.' }
}
