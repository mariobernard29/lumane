import { cache } from 'react'

import { createServerSupabase } from '../supabase/server.ts'

export interface PopularSearch {
  label: string
  href: string
  /** El atajo que la boutique quiere empujar: va con contorno negro. */
  emphasis: boolean
}

/**
 * Los atajos bajo el buscador.
 *
 * Viven en `banners` con `slot_key = 'search_popular'`, igual que la franja de
 * servicios de la portada: `title` es la etiqueta y `cta_href` el destino. Son
 * decisión comercial —qué quiere empujar la boutique esta temporada— y por eso
 * se editan desde el POS en lugar de escribirse aquí. `eyebrow = 'destacado'`
 * es el que va con contorno negro.
 *
 * La RLS ya descarta los apagados y los fuera de su ventana de fechas, así que
 * una campaña puede programarse para que aparezca y desaparezca sola.
 */
export const getPopularSearches = cache(async (): Promise<PopularSearch[]> => {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('banners')
    .select('title, cta_href, eyebrow')
    .eq('slot_key', 'search_popular')
    .order('position')

  if (error) {
    console.error('[buscar] no se pudieron leer las búsquedas populares:', error.message)
    return []
  }

  return (data ?? []).flatMap((row) =>
    row.title && row.cta_href
      ? [{ label: row.title, href: row.cta_href, emphasis: row.eyebrow === 'destacado' }]
      : [],
  )
})
