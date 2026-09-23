import { cache } from 'react'
import type { FooterColumn, FooterLink, HeaderNavItem } from '@lumane/ui-web'

import { createServerSupabase } from '../supabase/server.ts'

/**
 * Datos de la cabecera y el pie.
 *
 * Nada de esto está escrito en el código: el menú de categorías, las columnas
 * del pie, el contacto y el copyright son filas que la boutique edita desde el
 * POS. En el prototipo estaban duplicados a mano en las ocho páginas HTML.
 *
 * `cache()` los memoriza por petición: la cabecera y el pie los piden por
 * separado y no tiene sentido consultarlos dos veces.
 */

export interface StoreChrome {
  header: HeaderNavItem[]
  footerColumns: FooterColumn[]
  legalLinks: FooterLink[]
  settings: {
    storeName: string
    tagline: string | null
    contactEmail: string | null
    whatsappNumber: string | null
    openingHours: string | null
    socialLinks: Record<string, string>
    copyright: string | null
    newsletterTitle: string | null
    newsletterBody: string | null
    newsletterDisclaimer: string | null
    freeShippingOverCents: number | null
    taxRate: number
  }
}

/**
 * Los enlaces pequeños de la última línea del pie, no una columna.
 *
 * Es la única clave que el código sigue conociendo, y es estructura, no texto:
 * ese menú se pinta en otro sitio y con otra forma. Todo lo demás —qué
 * columnas hay, cómo se llaman y en qué orden— sale de `navigation_menus`
 * desde la migración 0052.
 */
const MENU_LEGAL = 'footer_legal'

export const getStoreChrome = cache(async (): Promise<StoreChrome> => {
  const supabase = await createServerSupabase()

  const [menusResult, settingsResult] = await Promise.all([
    supabase
      .from('navigation_menus')
      .select('key, name, position, navigation_items(id, label, href, position, is_emphasized, is_visible)')
      .order('position', { referencedTable: 'navigation_items' }),
    supabase.from('store_settings').select('*').single(),
  ])

  const menus = menusResult.data ?? []
  const settings = settingsResult.data

  const itemsOf = (key: string) =>
    (menus.find((m) => m.key === key)?.navigation_items ?? [])
      .filter((i) => i.is_visible)
      .sort((a, b) => a.position - b.position)

  const header: HeaderNavItem[] = itemsOf('header').map((i) => ({
    id: i.id,
    label: i.label,
    href: i.href,
    isEmphasized: i.is_emphasized,
  }))

  // Columna del pie = cualquier menú con prefijo `footer_` que no sea el legal.
  // Así añadir una cuarta columna es insertar una fila, no desplegar.
  const footerColumns: FooterColumn[] = menus
    .filter((m) => m.key.startsWith('footer_') && m.key !== MENU_LEGAL)
    .sort((a, b) => a.position - b.position)
    .map((m) => ({
      key: m.key,
      title: m.name,
      links: itemsOf(m.key).map((i) => ({ id: i.id, label: i.label, href: i.href })),
    }))
    .filter((column) => column.links.length > 0)

  const legalLinks: FooterLink[] = itemsOf(MENU_LEGAL).map((i) => ({
    id: i.id,
    label: i.label,
    href: i.href,
  }))

  return {
    header,
    footerColumns,
    legalLinks,
    settings: {
      storeName: settings?.store_name ?? 'LUMANE',
      tagline: settings?.tagline ?? null,
      contactEmail: settings?.contact_email ?? null,
      whatsappNumber: settings?.whatsapp_number ?? null,
      openingHours: settings?.opening_hours ?? null,
      socialLinks: (settings?.social_links as Record<string, string> | null) ?? {},
      copyright: settings?.copyright_text ?? null,
      newsletterTitle: settings?.newsletter_title ?? null,
      newsletterBody: settings?.newsletter_body ?? null,
      newsletterDisclaimer: settings?.newsletter_disclaimer ?? null,
      freeShippingOverCents: settings?.free_shipping_over_cents ?? null,
      taxRate: Number(settings?.tax_rate ?? 0.16),
    },
  }
})
