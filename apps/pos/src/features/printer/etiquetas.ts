import { useSyncExternalStore } from 'react'
import {
  buildEtiquetaPrueba,
  buildEtiquetas,
  FORMATOS_ETIQUETA,
  type AjustesEtiqueta,
  type DatosEtiqueta,
  type FormatoEtiqueta,
} from '@lumane/core'

import { supabase } from '@/lib/supabase'
import { imprimir, preferencias, type PreferenciasEtiquetadora } from './impresora.ts'

/**
 * Las etiquetas de las prendas: la lista de lo que hay que imprimir y el envío
 * a la etiquetadora.
 *
 * La lista vive en memoria y fuera de la pantalla a propósito: se llena desde
 * Etiquetas, pero también desde la ficha de una prenda («etiquetas de todas sus
 * tallas») o después de recibir mercancía, y tiene que seguir ahí al cambiar
 * de módulo. No se guarda en el aparato: una lista de hace tres días ya no es
 * lo que hay que etiquetar.
 */

export interface ItemEtiqueta {
  variantId: string
  nombre: string
  /** «Mediana / Negro»; vacío en prendas sin variantes. */
  detalle: string
  sku: string
  precioCents: number
  copias: number
}

let lista: ItemEtiqueta[] = []
const oyentes = new Set<() => void>()

function fijar(nueva: ItemEtiqueta[]) {
  lista = nueva
  for (const o of oyentes) o()
}

export function useListaEtiquetas(): ItemEtiqueta[] {
  return useSyncExternalStore(
    (o) => {
      oyentes.add(o)
      return () => oyentes.delete(o)
    },
    () => lista,
  )
}

/** Añade a la lista; si la variante ya estaba, suma las copias. */
export function agregarEtiquetas(items: ItemEtiqueta[]): void {
  const nueva = [...lista]
  for (const item of items) {
    const i = nueva.findIndex((x) => x.variantId === item.variantId)
    if (i >= 0) nueva[i] = { ...nueva[i]!, copias: nueva[i]!.copias + item.copias }
    else nueva.push(item)
  }
  fijar(nueva)
}

export function fijarCopias(variantId: string, copias: number): void {
  fijar(
    copias <= 0
      ? lista.filter((x) => x.variantId !== variantId)
      : lista.map((x) => (x.variantId === variantId ? { ...x, copias: Math.min(999, copias) } : x)),
  )
}

export function vaciarEtiquetas(): void {
  fijar([])
}

/**
 * Todas las variantes activas de una prenda, con tantas copias como piezas
 * hay en existencia (mínimo una): «etiquetar lo que acaba de llegar».
 */
export async function etiquetasDePrenda(productId: string): Promise<ItemEtiqueta[]> {
  const { data, error } = await supabase
    .from('products')
    .select(
      'name, product_variants(id, title, sku, price_cents, is_active, position, inventory_levels(available))',
    )
    .eq('id', productId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Esa prenda ya no existe')

  return [...(data.product_variants ?? [])]
    .filter((v) => v.is_active)
    .sort((a, b) => a.position - b.position)
    .map((v) => {
      const niveles = (v.inventory_levels ?? []) as {
        available: number | null
      }[]
      const piezas = niveles.reduce((s, n) => s + (n.available ?? 0), 0)
      return {
        variantId: v.id,
        nombre: data.name,
        detalle: v.title ?? '',
        sku: v.sku,
        precioCents: Number(v.price_cents),
        copias: Math.max(1, piezas),
      }
    })
}

// ---------------------------------------------------------------------------
// Formato e impresión
// ---------------------------------------------------------------------------

export function formatoDe(
  e: PreferenciasEtiquetadora,
): Pick<FormatoEtiqueta, 'anchoMm' | 'altoMm' | 'separacionMm'> {
  return { anchoMm: e.anchoMm, altoMm: e.altoMm, separacionMm: e.separacionMm }
}

export function ajustesDe(e: PreferenciasEtiquetadora): AjustesEtiqueta {
  return {
    densidad: e.densidad,
    velocidad: e.velocidad,
    girar: e.girar,
    desplazarXmm: e.desplazarXmm,
    desplazarYmm: e.desplazarYmm,
  }
}

export function nombreFormato(e: PreferenciasEtiquetadora): string {
  const f = FORMATOS_ETIQUETA.find((x) => x.id === e.formatoId)
  return f ? f.nombre : `${e.anchoMm} × ${e.altoMm} mm (personalizada)`
}

export function aDatos(items: ItemEtiqueta[]): DatosEtiqueta[] {
  return items.map((i) => ({
    nombre: i.nombre,
    detalle: i.detalle.trim() || null,
    precioCents: i.precioCents,
    sku: i.sku,
    copias: i.copias,
  }))
}

/**
 * Imprime la lista. Devuelve los avisos de la plantilla (un nombre o una talla
 * que no cupo entera) para enseñarlos, no para frenar la impresión.
 *
 * Se manda por tandas de 10 prendas: los textos viajan como imagen (~3 KB por
 * prenda distinta; las copias no se vuelven a mandar), un trabajo de 300
 * etiquetas en un solo envío tarda en cruzar el Bluetooth más de lo que espera
 * el módulo nativo, y si se corta a la mitad no se sabe cuáles salieron.
 */
export async function imprimirEtiquetas(items: ItemEtiqueta[]): Promise<string[]> {
  const e = preferencias().etiquetadora
  const avisos = new Set<string>()
  for (let i = 0; i < items.length; i += 10) {
    const tanda = buildEtiquetas(aDatos(items.slice(i, i + 10)), formatoDe(e), ajustesDe(e))
    for (const a of tanda.avisos) avisos.add(a)
    await imprimir(tanda.bytes, 1, 'etiquetas')
  }
  return [...avisos]
}

export async function imprimirEtiquetaPrueba(): Promise<void> {
  const e = preferencias().etiquetadora
  await imprimir(buildEtiquetaPrueba(formatoDe(e), ajustesDe(e)), 1, 'etiquetas')
}
