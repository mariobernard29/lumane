'use server'

import { z } from 'zod'

import { createServerSupabase } from '@/lib/supabase/server'

const schema = z.object({
  email: z.email('Escribe un correo válido'),
})

/**
 * Alta en el boletín.
 *
 * `on conflict do nothing` a nivel de base: si alguien se suscribe dos veces,
 * no es un error que deba ver, simplemente ya estaba. Y nunca se confirma ni
 * se niega si el correo ya existía — eso convertiría el formulario en una
 * forma de averiguar quién es clienta de Lumane.
 */
export async function subscribeToNewsletter(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({ email: formData.get('email') })
  if (!parsed.success) return

  const supabase = await createServerSupabase()
  await supabase
    .from('newsletter_subscribers')
    .upsert({ email: parsed.data.email, source: 'storefront' }, { onConflict: 'email', ignoreDuplicates: true })
}
