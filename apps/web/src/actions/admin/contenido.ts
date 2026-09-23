'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Las escrituras del panel de contenido.
 *
 * **Van con `createServerSupabase()`, nunca con `createAdminSupabase()`.** El
 * primero usa la sesión y la llave publicable, así que cada escritura pasa por
 * RLS y la base comprueba `cms.write` por su cuenta; el segundo salta RLS por
 * completo y su propio comentario advierte que verlo en una página es un
 * error. Si una política estuviera mal, esto falla — que es lo que se quiere.
 *
 * Por eso ninguna de estas funciones comprueba permisos: hacerlo aquí sería
 * una segunda opinión que puede desincronizarse de la primera.
 */

export interface ResultadoAdmin {
  ok: boolean
  mensaje: string
}

/** `''` significa «vaciar el campo», no «no tocar»: un formulario manda todo. */
function texto(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

const ajustesSchema = z.object({
  storeName: z.string().min(2, 'El nombre de la tienda no puede quedar vacío'),
  tagline: z.string().nullable(),
  contactEmail: z.string().email('Ese correo no parece válido').nullable(),
  contactPhone: z.string().nullable(),
  whatsappNumber: z.string().nullable(),
  openingHours: z.string().nullable(),
  newsletterTitle: z.string().nullable(),
  newsletterBody: z.string().nullable(),
  newsletterDisclaimer: z.string().nullable(),
  copyrightText: z.string().nullable(),
  instagram: z.string().nullable(),
  facebook: z.string().nullable(),
  tiktok: z.string().nullable(),
})

export async function guardarAjustes(formData: FormData): Promise<ResultadoAdmin> {
  const parsed = ajustesSchema.safeParse({
    storeName: formData.get('storeName'),
    tagline: texto(formData.get('tagline')),
    contactEmail: texto(formData.get('contactEmail')),
    contactPhone: texto(formData.get('contactPhone')),
    whatsappNumber: texto(formData.get('whatsappNumber')),
    openingHours: texto(formData.get('openingHours')),
    newsletterTitle: texto(formData.get('newsletterTitle')),
    newsletterBody: texto(formData.get('newsletterBody')),
    newsletterDisclaimer: texto(formData.get('newsletterDisclaimer')),
    copyrightText: texto(formData.get('copyrightText')),
    instagram: texto(formData.get('instagram')),
    facebook: texto(formData.get('facebook')),
    tiktok: texto(formData.get('tiktok')),
  })

  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0]?.message ?? 'Revisa los datos' }
  }

  const d = parsed.data

  // Las redes se guardan juntas en un jsonb. Solo las que tienen valor: dejar
  // claves vacías obligaría a cada componente del pie a distinguir entre «no
  // hay Instagram» y «hay una cadena vacía».
  const social: Record<string, string> = {}
  if (d.instagram) social.instagram = d.instagram
  if (d.facebook) social.facebook = d.facebook
  if (d.tiktok) social.tiktok = d.tiktok

  const supabase = await createServerSupabase()
  const { data: filas, error } = await supabase
    .from('store_settings')
    .update({
      store_name: d.storeName,
      tagline: d.tagline,
      contact_email: d.contactEmail,
      contact_phone: d.contactPhone,
      whatsapp_number: d.whatsappNumber,
      opening_hours: d.openingHours,
      newsletter_title: d.newsletterTitle,
      newsletter_body: d.newsletterBody,
      newsletter_disclaimer: d.newsletterDisclaimer,
      copyright_text: d.copyrightText,
      social_links: social,
    })
    // `store_settings` es un singleton: su clave primaria es un boolean que
    // solo admite `true`. El filtro es obligatorio igualmente — un `update`
    // sin `where` sobre PostgREST se rechaza, y con razón.
    .eq('id', true)
    // El `select` NO es decorativo. Sin permiso `cms.write`, RLS no lanza un
    // error: filtra la fila y el update afecta a CERO filas en silencio.
    // Comprobado contra la base con la cuenta de una clienta. Sin esto, una
    // cajera vería «Guardado» y no se habría guardado nada — que es peor que
    // un error, porque nadie va a revisar si se aplicó.
    .select('id')

  if (error) {
    // El mensaje de Postgres se enseña tal cual: si RLS rechazó por falta de
    // `cms.write`, decirlo es más útil que un «algo salió mal».
    return { ok: false, mensaje: error.message }
  }

  if (!filas || filas.length === 0) {
    return {
      ok: false,
      mensaje: 'No tienes permiso para cambiar los ajustes de la tienda.',
    }
  }

  // No hay caché de contenido todavía (eso es la Fase 4), así que el sitio ya
  // refleja el cambio en la siguiente visita. Esto solo tira lo que Next tenga
  // en su caché de router para estas rutas.
  revalidatePath('/', 'layout')
  return { ok: true, mensaje: 'Guardado. Ya se ve en la tienda.' }
}
