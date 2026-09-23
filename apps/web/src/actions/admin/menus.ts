'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createServerSupabase } from '@/lib/supabase/server'
import type { ResultadoAdmin } from './contenido.ts'

/**
 * Los menús: navegación de arriba, columnas del pie y línea legal.
 *
 * Como en `contenido.ts`, se escribe con la sesión y RLS decide. Y como allí,
 * **cada escritura lleva `.select()` detrás**: sin permiso `cms.write` la base
 * no lanza un error, filtra las filas y el update afecta a cero en silencio.
 * Sin comprobarlo, el panel diría «guardado» sin haber guardado.
 */

const enlaceSchema = z.object({
  id: z.string().uuid().optional(),
  menuId: z.string().uuid(),
  label: z.string().min(1, 'El enlace necesita un texto'),
  href: z.string().min(1, 'El enlace necesita un destino'),
  position: z.number().int().min(0),
  isVisible: z.boolean(),
  isEmphasized: z.boolean(),
})

export async function guardarEnlace(formData: FormData): Promise<ResultadoAdmin> {
  const parsed = enlaceSchema.safeParse({
    id: (formData.get('id') as string) || undefined,
    menuId: formData.get('menuId'),
    label: (formData.get('label') as string)?.trim(),
    href: (formData.get('href') as string)?.trim(),
    position: Number(formData.get('position') ?? 0),
    isVisible: formData.get('isVisible') === 'on',
    isEmphasized: formData.get('isEmphasized') === 'on',
  })

  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0]?.message ?? 'Revisa los datos' }
  }

  const d = parsed.data
  const supabase = await createServerSupabase()

  const fila = {
    menu_id: d.menuId,
    label: d.label,
    href: d.href,
    position: d.position,
    is_visible: d.isVisible,
    is_emphasized: d.isEmphasized,
  }

  const { data, error } = d.id
    ? await supabase.from('navigation_items').update(fila).eq('id', d.id).select('id')
    : await supabase.from('navigation_items').insert(fila).select('id')

  if (error) return { ok: false, mensaje: error.message }
  if (!data || data.length === 0) {
    return { ok: false, mensaje: 'No tienes permiso para cambiar los menús.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, mensaje: d.id ? 'Enlace actualizado.' : 'Enlace añadido.' }
}

export async function borrarEnlace(id: string): Promise<ResultadoAdmin> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('navigation_items')
    .delete()
    .eq('id', id)
    .select('id')

  if (error) return { ok: false, mensaje: error.message }
  if (!data || data.length === 0) {
    return { ok: false, mensaje: 'No tienes permiso para borrar enlaces.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, mensaje: 'Enlace borrado.' }
}

/**
 * Mover un enlace arriba o abajo.
 *
 * Se intercambian las posiciones de dos filas vecinas en lugar de renumerar la
 * lista entera: son dos escrituras en vez de N, y si una falla la lista queda
 * con dos elementos en el mismo sitio, no descolocada del todo.
 *
 * Arrastrar y soltar sería más bonito y peor: el panel se usa desde una tablet
 * donde arrastrar dentro de una página que también se desplaza es una pelea.
 */
export async function moverEnlace(id: string, direccion: 'arriba' | 'abajo'): Promise<ResultadoAdmin> {
  const supabase = await createServerSupabase()

  const { data: actual, error: e1 } = await supabase
    .from('navigation_items')
    .select('id, menu_id, position')
    .eq('id', id)
    .single()

  if (e1 || !actual) return { ok: false, mensaje: e1?.message ?? 'No encontramos ese enlace' }

  const { data: vecino } = await supabase
    .from('navigation_items')
    .select('id, position')
    .eq('menu_id', actual.menu_id)
    .order('position', { ascending: direccion === 'abajo' })
    [direccion === 'abajo' ? 'gt' : 'lt']('position', actual.position)
    .limit(1)
    .maybeSingle()

  // Ya está en un extremo: no es un error, simplemente no hay a dónde moverlo.
  if (!vecino) return { ok: true, mensaje: '' }

  const [a, b] = await Promise.all([
    supabase.from('navigation_items').update({ position: vecino.position }).eq('id', actual.id).select('id'),
    supabase.from('navigation_items').update({ position: actual.position }).eq('id', vecino.id).select('id'),
  ])

  if (a.error || b.error) return { ok: false, mensaje: a.error?.message ?? b.error!.message }
  if (!a.data?.length || !b.data?.length) {
    return { ok: false, mensaje: 'No tienes permiso para reordenar los menús.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, mensaje: '' }
}

/** El título de una columna del pie. Es `navigation_menus.name` desde la 0052. */
export async function renombrarMenu(id: string, nombre: string): Promise<ResultadoAdmin> {
  const limpio = nombre.trim()
  if (limpio === '') return { ok: false, mensaje: 'La columna necesita un título' }

  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('navigation_menus')
    .update({ name: limpio })
    .eq('id', id)
    .select('id')

  if (error) return { ok: false, mensaje: error.message }
  if (!data || data.length === 0) {
    return { ok: false, mensaje: 'No tienes permiso para cambiar los menús.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, mensaje: 'Título actualizado.' }
}
