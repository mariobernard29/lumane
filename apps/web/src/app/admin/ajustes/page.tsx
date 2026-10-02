import { createServerSupabase } from '@/lib/supabase/server'
import { FormularioAjustes, type AjustesIniciales } from './Formulario.tsx'

/**
 * Ajustes de la tienda.
 *
 * Todo lo de esta pantalla es la única fila de `store_settings`, que hasta hoy
 * solo se podía cambiar escribiendo una migración — las 0037 y la 0040 de este
 * repo son exactamente eso: ediciones de contenido versionadas como cambios de
 * esquema.
 *
 * Los campos que NO están aquí a propósito: `tax_rate`, `reservation_minutes`
 * y `free_shipping_over_cents`. Son reglas de negocio con consecuencias
 * contables y de inventario, no texto; un campo de «IVA» junto al de Instagram
 * invita a tocarlo sin pensar.
 */

function cadena(v: string | null | undefined): string {
  return v ?? ''
}

export default async function AjustesPage() {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('store_settings')
    // En UNA cadena literal, sin concatenar: supabase-js deduce el tipo del
    // resultado analizando este texto, y un `+` lo degrada a `string` genérico
    // — el objeto devuelto pierde todas sus columnas.
    .select('store_name, tagline, contact_email, admin_email, contact_phone, whatsapp_number, opening_hours, newsletter_title, newsletter_body, newsletter_disclaimer, copyright_text, ticket_thanks, social_links')
    .eq('id', true)
    .maybeSingle()

  if (error || !data) {
    return (
      <p className="font-body-md text-body-md text-primary">
        No se pudieron leer los ajustes: {error?.message ?? 'no hay ninguna fila'}
      </p>
    )
  }

  const social = (data.social_links ?? {}) as Record<string, string>

  const inicial: AjustesIniciales = {
    storeName: cadena(data.store_name),
    tagline: cadena(data.tagline),
    contactEmail: cadena(data.contact_email),
    adminEmail: cadena(data.admin_email),
    contactPhone: cadena(data.contact_phone),
    whatsappNumber: cadena(data.whatsapp_number),
    openingHours: cadena(data.opening_hours),
    newsletterTitle: cadena(data.newsletter_title),
    newsletterBody: cadena(data.newsletter_body),
    newsletterDisclaimer: cadena(data.newsletter_disclaimer),
    copyrightText: cadena(data.copyright_text),
    ticketThanks: cadena(data.ticket_thanks),
    instagram: cadena(social.instagram),
    facebook: cadena(social.facebook),
    tiktok: cadena(social.tiktok),
  }

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="font-headline-md text-headline-md text-primary">Ajustes</h1>
        <p className="font-body-md text-body-md text-text-muted">
          Lo que cambies aquí se ve en la tienda al instante, sin desplegar nada.
        </p>
      </header>

      <FormularioAjustes inicial={inicial} />
    </div>
  )
}
