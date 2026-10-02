'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createServerSupabase } from '@/lib/supabase/server'
import type { ResultadoAdmin } from './contenido.ts'

/**
 * Las escrituras del catálogo.
 *
 * Gobernadas por `inventory.write` y no por `cms.write`: son dos permisos
 * distintos a propósito desde la migración 0002, y es lo que permite que una
 * encargada cambie los textos del sitio sin poder tocar precios.
 *
 * Como en el resto del panel, cada escritura lleva `.select()` detrás: sin
 * permiso RLS no lanza un error, filtra la fila y el update afecta a cero en
 * silencio. Sin comprobarlo diríamos «guardado» sin guardar.
 *
 * **Aquí no se calcula dinero.** Los precios se guardan en centavos tal como
 * los teclea la propietaria; lo que cobra una venta lo recalcula `pricing` en
 * Postgres contra estas mismas filas. Esta pantalla es el origen del dato, no
 * un segundo motor de precios.
 */

/** Pesos con o sin decimales a centavos. `null` = el campo quedó vacío. */
function aCentavos(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? '').trim().replace(/[$,\s]/g, '')
  if (s === '') return null
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

function texto(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

const productoSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2, 'La prenda necesita un nombre'),
  slug: z
    .string()
    .min(2, 'La dirección de la prenda no puede quedar vacía')
    .regex(/^[a-z0-9-]+$/, 'La dirección solo admite minúsculas, números y guiones'),
  shortDescription: z.string().nullable(),
  longDescription: z.string().nullable(),
  fitNote: z.string().nullable(),
  materials: z.string().nullable(),
  care: z.string().nullable(),
  brand: z.string().nullable(),
  status: z.enum(['draft', 'active', 'archived']),
  isOnline: z.boolean(),
  primaryCategoryId: z.string().uuid().nullable(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
})

export async function guardarProducto(formData: FormData): Promise<ResultadoAdmin> {
  const parsed = productoSchema.safeParse({
    id: formData.get('id'),
    name: (formData.get('name') as string)?.trim(),
    slug: (formData.get('slug') as string)?.trim().toLowerCase(),
    shortDescription: texto(formData.get('shortDescription')),
    longDescription: texto(formData.get('longDescription')),
    fitNote: texto(formData.get('fitNote')),
    materials: texto(formData.get('materials')),
    care: texto(formData.get('care')),
    brand: texto(formData.get('brand')),
    status: formData.get('status'),
    isOnline: formData.get('isOnline') === 'on',
    primaryCategoryId: texto(formData.get('primaryCategoryId')),
    seoTitle: texto(formData.get('seoTitle')),
    seoDescription: texto(formData.get('seoDescription')),
  })

  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0]?.message ?? 'Revisa los datos' }
  }
  const d = parsed.data

  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('products')
    .update({
      name: d.name,
      slug: d.slug,
      short_description: d.shortDescription,
      long_description: d.longDescription,
      fit_note: d.fitNote,
      materials: d.materials,
      care: d.care,
      brand: d.brand,
      status: d.status,
      is_online: d.isOnline,
      primary_category_id: d.primaryCategoryId,
      seo_title: d.seoTitle,
      seo_description: d.seoDescription,
    })
    .eq('id', d.id)
    .select('id, published_at')

  if (error) {
    // Un slug repetido llega como 23505 con un mensaje de Postgres ilegible.
    if (error.code === '23505') {
      return { ok: false, mensaje: `Ya hay otra prenda con la dirección «${d.slug}».` }
    }
    return { ok: false, mensaje: error.message }
  }
  if (!data || data.length === 0) {
    return { ok: false, mensaje: 'No tienes permiso para editar el catálogo.' }
  }

  // `published_at` se sella aparte, y solo la PRIMERA vez que la prenda pasa a
  // activa: es cuándo salió al mundo, no cuándo se editó por última vez.
  // Incluirlo en el update de arriba pisaría la fecha original cada vez que se
  // corrige una falta de ortografía.
  if (d.status === 'active' && data[0]?.published_at == null) {
    await supabase.from('products').update({ published_at: new Date().toISOString() }).eq('id', d.id)
  }

  revalidatePath('/', 'layout')
  return { ok: true, mensaje: 'Prenda guardada.' }
}

const varianteSchema = z
  .object({
    id: z.string().uuid().optional(),
    productId: z.string().uuid(),
    title: z.string().min(1, 'La variante necesita un nombre (la talla, por ejemplo)'),
    sku: z.string().min(1, 'La variante necesita un SKU'),
    barcode: z.string().nullable(),
    priceCents: z.number().int().min(0, 'El precio no puede ser negativo'),
    compareAtPriceCents: z.number().int().min(0).nullable(),
    isActive: z.boolean(),
    position: z.number().int().min(0),
  })
  .refine((v) => v.compareAtPriceCents === null || v.compareAtPriceCents > v.priceCents, {
    message: 'El precio anterior tiene que ser MAYOR que el precio actual, o quedarse vacío',
  })

export async function guardarVariante(formData: FormData): Promise<ResultadoAdmin> {
  const precio = aCentavos(formData.get('price'))
  if (precio === null) return { ok: false, mensaje: 'Escribe un precio válido' }

  const parsed = varianteSchema.safeParse({
    id: (formData.get('id') as string) || undefined,
    productId: formData.get('productId'),
    title: (formData.get('title') as string)?.trim(),
    sku: (formData.get('sku') as string)?.trim(),
    barcode: texto(formData.get('barcode')),
    priceCents: precio,
    compareAtPriceCents: aCentavos(formData.get('compareAt')),
    isActive: formData.get('isActive') === 'on',
    position: Number(formData.get('position') ?? 0),
  })

  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0]?.message ?? 'Revisa los datos' }
  }
  const d = parsed.data

  const fila = {
    product_id: d.productId,
    title: d.title,
    sku: d.sku,
    barcode: d.barcode,
    price_cents: d.priceCents,
    compare_at_price_cents: d.compareAtPriceCents,
    is_active: d.isActive,
    position: d.position,
  }

  const supabase = await createServerSupabase()
  const { data, error } = d.id
    ? await supabase.from('product_variants').update(fila).eq('id', d.id).select('id')
    : await supabase.from('product_variants').insert(fila).select('id')

  if (error) {
    if (error.code === '23505') {
      return {
        ok: false,
        mensaje: 'Ese SKU o ese código de barras ya los usa otra variante.',
      }
    }
    return { ok: false, mensaje: error.message }
  }
  if (!data || data.length === 0) {
    return { ok: false, mensaje: 'No tienes permiso para editar el catálogo.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, mensaje: d.id ? 'Variante guardada.' : 'Variante añadida.' }
}

/**
 * Registrar una foto ya subida.
 *
 * La SUBIDA la hace el navegador contra Storage; esto solo guarda la ruta. Son
 * dos permisos distintos comprobados por separado —la política del bucket y la
 * de la tabla—, los dos con `inventory.write`.
 */
export async function registrarFoto(
  productId: string,
  path: string,
  alt: string,
): Promise<ResultadoAdmin> {
  const supabase = await createServerSupabase()

  const { count } = await supabase
    .from('product_images')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId)

  const { data, error } = await supabase
    .from('product_images')
    .insert({
      product_id: productId,
      storage_path: path,
      alt_text: alt.trim(),
      position: count ?? 0,
    })
    .select('id')

  if (error) return { ok: false, mensaje: error.message }
  if (!data || data.length === 0) {
    return { ok: false, mensaje: 'No tienes permiso para editar el catálogo.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, mensaje: 'Foto añadida.' }
}

export async function guardarAltDeFoto(id: string, alt: string): Promise<ResultadoAdmin> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('product_images')
    .update({ alt_text: alt.trim() })
    .eq('id', id)
    .select('id')

  if (error) return { ok: false, mensaje: error.message }
  if (!data?.length) return { ok: false, mensaje: 'No tienes permiso para editar el catálogo.' }

  revalidatePath('/', 'layout')
  return { ok: true, mensaje: 'Descripción guardada.' }
}

/**
 * Quitar una foto de la ficha.
 *
 * Borra la FILA, no el objeto de Storage. Es deliberado: un borrado mal hecho
 * destruye la única copia de una fotografía, y el coste de dejar el archivo
 * huérfano son céntimos. Si algún día molesta, se limpia con un barrido que
 * compare el bucket contra la tabla.
 */
export async function quitarFoto(id: string): Promise<ResultadoAdmin> {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase.from('product_images').delete().eq('id', id).select('id')

  if (error) return { ok: false, mensaje: error.message }
  if (!data?.length) return { ok: false, mensaje: 'No tienes permiso para editar el catálogo.' }

  revalidatePath('/', 'layout')
  return { ok: true, mensaje: 'Foto quitada de la ficha.' }
}
