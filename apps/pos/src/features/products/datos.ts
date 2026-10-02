import { randomUUID } from 'expo-crypto'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { BUCKETS, errorMessage } from '@lumane/db'
import type { OpcionProducto, VarianteEditable } from '@lumane/core'

import { supabase } from '@/lib/supabase'

/**
 * El catálogo desde la tablet: leer, guardar, borrar.
 *
 * Las lecturas van directas a las tablas (RLS deja leerlo todo a quien tiene
 * `inventory.write`); las escrituras de una prenda van por `pos_save_product`,
 * que guarda prenda, opciones, valores y variantes en una transacción.
 */

export type EstadoProducto = 'active' | 'draft' | 'archived'

export interface FilaProducto {
  id: string
  name: string
  code: string | null
  status: EstadoProducto
  isOnline: boolean
  categoria: string | null
  variantes: number
  foto: string | null
}

export interface Categoria {
  id: string
  name: string
  parentId: string | null
  isVisible: boolean
  productos: number
}

export interface Foto {
  id: string
  path: string
}

export interface ProductoCompleto {
  id: string | null
  name: string
  code: string
  brand: string
  shortDescription: string
  longDescription: string
  materials: string
  care: string
  categoryId: string | null
  status: EstadoProducto
  isOnline: boolean
  opciones: OpcionProducto[]
  variantes: VarianteEditable[]
  fotos: Foto[]
  /** Disponibles por variante, solo para informar. */
  existencias: Record<string, number>
}

export function productoVacio(): ProductoCompleto {
  return {
    id: null,
    name: '',
    code: '',
    brand: '',
    shortDescription: '',
    longDescription: '',
    materials: '',
    care: '',
    categoryId: null,
    status: 'active',
    isOnline: true,
    opciones: [],
    variantes: [],
    fotos: [],
    existencias: {},
  }
}

function fallar(error: { message?: string } | null): never {
  throw new Error(errorMessage(error))
}

export async function listarProductos(busqueda: string): Promise<FilaProducto[]> {
  let q = supabase
    .from('products')
    .select(
      'id, name, code, status, is_online, categoria:categories!products_primary_category_id_fkey(name), product_variants(count), product_images(storage_path, position)',
    )
    .order('updated_at', { ascending: false })
    .limit(200)

  const texto = busqueda.trim()
  if (texto !== '') {
    // Por nombre o por código base. El SKU de una variante se busca en Venta
    // o en Inventario; aquí se piensa en prendas, no en tallas.
    const patron = `%${texto.replace(/[%_,()]/g, ' ')}%`
    q = q.or(`name.ilike.${patron},code.ilike.${patron}`)
  }

  const { data, error } = await q
  if (error) fallar(error)

  return (data ?? []).map((p) => {
    const fotos = [...(p.product_images ?? [])].sort((a, b) => a.position - b.position)
    const conteo = p.product_variants as unknown as { count: number }[] | null
    const categoria = p.categoria as unknown as { name: string } | null
    return {
      id: p.id,
      name: p.name,
      code: p.code,
      status: p.status as EstadoProducto,
      isOnline: p.is_online,
      categoria: categoria?.name ?? null,
      variantes: conteo?.[0]?.count ?? 0,
      foto: fotos[0]?.storage_path ?? null,
    }
  })
}

export async function cargarProducto(id: string): Promise<ProductoCompleto> {
  const { data: p, error } = await supabase
    .from('products')
    .select(
      `id, name, code, brand, short_description, long_description, materials, care,
       primary_category_id, status, is_online,
       product_options(id, name, position, product_option_values(id, value, code, position)),
       product_variants(id, sku, barcode, price_cents, compare_at_price_cents, is_active, position,
                        variant_option_values(option_value_id)),
       product_images(id, storage_path, position)`,
    )
    .eq('id', id)
    .maybeSingle()

  if (error) fallar(error)
  if (!p) throw new Error('Esa prenda ya no existe')

  const opcionesOrdenadas = [...(p.product_options ?? [])].sort((a, b) => a.position - b.position)
  const valorPorId = new Map<string, { opcion: number; value: string }>()
  const opciones: OpcionProducto[] = opcionesOrdenadas.map((o, i) => ({
    name: o.name,
    values: [...(o.product_option_values ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((v) => {
        valorPorId.set(v.id, { opcion: i, value: v.value })
        return { value: v.value, code: v.code ?? '' }
      }),
  }))

  const variantes: VarianteEditable[] = [...(p.product_variants ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((v) => {
      const values: string[] = new Array(opciones.length).fill('')
      for (const vov of v.variant_option_values ?? []) {
        const val = valorPorId.get(vov.option_value_id)
        if (val) values[val.opcion] = val.value
      }
      return {
        id: v.id,
        values,
        sku: v.sku,
        barcode: v.barcode,
        priceCents: Number(v.price_cents),
        compareAtPriceCents: v.compare_at_price_cents == null ? null : Number(v.compare_at_price_cents),
        isActive: v.is_active,
      }
    })
    // Una variante apagada sin valores es historia de una opción que se
    // quitó: no se puede volver a generar, así que no se edita aquí.
    .filter((v) => opciones.length === 0 || v.values.every((x) => x !== ''))

  const ids = variantes.map((v) => v.id!).filter(Boolean)
  const existencias: Record<string, number> = {}
  if (ids.length > 0) {
    const { data: niveles } = await supabase
      .from('inventory_levels')
      .select('variant_id, available')
      .in('variant_id', ids)
    for (const n of niveles ?? []) existencias[n.variant_id] = (existencias[n.variant_id] ?? 0) + (n.available ?? 0)
  }

  return {
    id: p.id,
    name: p.name,
    // Las prendas anteriores a este módulo no tienen código base; el prefijo
    // de su primer SKU es la mejor propuesta. Sus SKU guardados no cambian
    // salvo que se pida regenerarlos.
    code: p.code ?? variantes[0]?.sku.split('-')[0] ?? '',
    brand: p.brand ?? '',
    shortDescription: p.short_description ?? '',
    longDescription: p.long_description ?? '',
    materials: p.materials ?? '',
    care: p.care ?? '',
    categoryId: p.primary_category_id,
    status: p.status as EstadoProducto,
    isOnline: p.is_online,
    opciones,
    variantes,
    fotos: [...(p.product_images ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((f) => ({ id: f.id, path: f.storage_path })),
    existencias,
  }
}

/** Guarda la prenda completa. Devuelve su id (el nuevo, si se creó). */
export async function guardarProducto(p: ProductoCompleto): Promise<string> {
  const { data, error } = await supabase.rpc('pos_save_product', {
    p_payload: {
      id: p.id,
      name: p.name,
      code: p.code,
      brand: p.brand,
      short_description: p.shortDescription,
      long_description: p.longDescription,
      materials: p.materials,
      care: p.care,
      category_id: p.categoryId,
      status: p.status,
      is_online: p.isOnline,
      options: p.opciones
        .filter((o) => o.values.length > 0)
        .map((o) => ({ name: o.name, values: o.values.map((v) => ({ value: v.value, code: v.code })) })),
      variants: p.variantes.map((v) => ({
        id: v.id,
        values: v.values,
        sku: v.sku,
        barcode: v.barcode,
        price_cents: v.priceCents,
        compare_at_price_cents: v.compareAtPriceCents,
        is_active: v.isActive,
      })),
    },
  })
  if (error) fallar(error)
  return (data as unknown as { id: string }).id
}

/** `true` si se archivó en vez de borrarse (porque ya tenía historia). */
export async function borrarProducto(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('pos_delete_product', { p_product_id: id })
  if (error) fallar(error)
  return (data as unknown as { archived: boolean }).archived
}

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------

export async function listarCategorias(): Promise<Categoria[]> {
  const [{ data, error }, { data: conteos }] = await Promise.all([
    supabase.from('categories').select('id, name, parent_id, is_visible, position').order('position'),
    supabase.from('products').select('primary_category_id').not('primary_category_id', 'is', null),
  ])
  if (error) fallar(error)

  const porCategoria = new Map<string, number>()
  for (const c of conteos ?? []) {
    const id = c.primary_category_id!
    porCategoria.set(id, (porCategoria.get(id) ?? 0) + 1)
  }

  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    parentId: c.parent_id,
    isVisible: c.is_visible,
    productos: porCategoria.get(c.id) ?? 0,
  }))
}

export async function guardarCategoria(c: {
  id: string | null
  name: string
  parentId: string | null
  isVisible: boolean
}): Promise<void> {
  const { error } = await supabase.rpc('pos_save_category', {
    // El RPC acepta null para «nueva»; los tipos generados no lo saben.
    p_id: c.id as string,
    p_name: c.name,
    p_parent_id: c.parentId ?? undefined,
    p_is_visible: c.isVisible,
  })
  if (error) fallar(error)
}

/**
 * Las prendas de la categoría se quedan sin categoría (la base lo hace con
 * `on delete set null`); no se borra ninguna prenda.
 */
export async function borrarCategoria(id: string): Promise<void> {
  const { data, error } = await supabase.from('categories').delete().eq('id', id).select('id')
  if (error) fallar(error)
  // Sin permiso, RLS no lanza: filtra la fila y no borra nada.
  if (!data?.length) throw new Error('No tienes permiso para borrar categorías')
}

// ---------------------------------------------------------------------------
// Fotos
// ---------------------------------------------------------------------------

/** El lado más largo, igual que el admin web: de sobra para la ficha. */
const LADO_MAXIMO = 2000

/**
 * Reduce la foto, la sube a Storage y la añade al final de la ficha.
 *
 * Se reduce en la tablet porque una foto de cámara pesa varios megas y el
 * bucket rechaza más de cinco; además se sube en el wifi de la tienda.
 */
export async function subirFoto(
  productId: string,
  uri: string,
  medidas: { width: number; height: number },
  posicion: number,
): Promise<Foto> {
  const escala = Math.min(1, LADO_MAXIMO / Math.max(medidas.width, medidas.height))
  const contexto = ImageManipulator.manipulate(uri)
  if (escala < 1) {
    contexto.resize({ width: Math.round(medidas.width * escala) })
  }
  const imagen = await contexto.renderAsync()
  const guardada = await imagen.saveAsync({ format: SaveFormat.WEBP, compress: 0.82 })

  const cuerpo = await (await fetch(guardada.uri)).arrayBuffer()
  const path = `${productId}/${randomUUID()}.webp`

  const { error: fallo } = await supabase.storage
    .from(BUCKETS.products)
    .upload(path, cuerpo, { contentType: 'image/webp', upsert: false })
  if (fallo) throw new Error(fallo.message)

  const { data, error } = await supabase
    .from('product_images')
    .insert({ product_id: productId, storage_path: path, alt_text: '', position: posicion })
    .select('id')
    .single()
  if (error) fallar(error)

  return { id: data.id, path }
}

/**
 * Quita la foto de la ficha. El archivo se queda en Storage, igual que en el
 * admin web: borrar la única copia de una foto por un toque equivocado sale
 * más caro que unos KB huérfanos.
 */
export async function quitarFoto(id: string): Promise<void> {
  const { data, error } = await supabase.from('product_images').delete().eq('id', id).select('id')
  if (error) fallar(error)
  if (!data?.length) throw new Error('No tienes permiso para editar las fotos')
}
