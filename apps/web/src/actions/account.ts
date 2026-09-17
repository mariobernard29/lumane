'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Acciones del área de clienta.
 *
 * Ninguna comprueba la propiedad de la fila, y no es un descuido: los datos
 * personales pasan por `update_my_profile`, que resuelve la clienta desde la
 * sesión, y las direcciones y favoritos están cubiertos por políticas RLS con
 * `customer_id = current_customer_id()`. Aunque estas funciones mandaran otro
 * id, la base rechazaría la escritura.
 */

export interface ActionResult {
  ok: boolean
  message?: string
}

const profileSchema = z.object({
  firstName: z.string().min(2, 'Escribe tu nombre'),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  // El campo de fecha puede llegar vacío; vacío significa "no cambiar".
  birthday: z.string().optional(),
  acceptsMarketing: z.boolean(),
})

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const parsed = profileSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName') || undefined,
    phone: formData.get('phone') || undefined,
    birthday: formData.get('birthday') || undefined,
    acceptsMarketing: formData.get('acceptsMarketing') === 'on',
  })
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Revisa los datos' }
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase.rpc('update_my_profile', {
    p_first_name: parsed.data.firstName,
    p_last_name: parsed.data.lastName ?? undefined,
    p_phone: parsed.data.phone ?? undefined,
    p_birthday: parsed.data.birthday ?? undefined,
    p_accepts_marketing: parsed.data.acceptsMarketing,
  })

  if (error) {
    console.error('[cuenta] update_my_profile falló:', error.message)
    return { ok: false, message: 'No pudimos guardar tus datos' }
  }

  revalidatePath('/cuenta')
  revalidatePath('/', 'layout')
  return { ok: true, message: 'Datos guardados' }
}

const addressSchema = z.object({
  id: z.uuid().optional(),
  label: z.string().optional(),
  recipient: z.string().min(2, 'Escribe el nombre de quien recibe'),
  street: z.string().min(3, 'Escribe la calle'),
  extNo: z.string().optional(),
  intNo: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().min(2, 'Escribe la ciudad'),
  state: z.string().min(2, 'Elige el estado'),
  postalCode: z.string().regex(/^\d{5}$/, 'El código postal son 5 dígitos'),
  phone: z.string().optional(),
  deliveryNotes: z.string().optional(),
  isDefault: z.boolean(),
})

export async function saveAddress(formData: FormData): Promise<ActionResult> {
  const parsed = addressSchema.safeParse({
    id: formData.get('id') || undefined,
    label: formData.get('label') || undefined,
    recipient: formData.get('recipient'),
    street: formData.get('street'),
    extNo: formData.get('extNo') || undefined,
    intNo: formData.get('intNo') || undefined,
    neighborhood: formData.get('neighborhood') || undefined,
    city: formData.get('city'),
    state: formData.get('state'),
    postalCode: formData.get('postalCode'),
    phone: formData.get('phone') || undefined,
    deliveryNotes: formData.get('deliveryNotes') || undefined,
    isDefault: formData.get('isDefault') === 'on',
  })
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Revisa la dirección' }
  }

  const supabase = await createServerSupabase()
  const { data: customer } = await supabase.from('customers').select('id').maybeSingle()
  if (!customer) return { ok: false, message: 'Necesitas iniciar sesión' }

  const d = parsed.data
  const row = {
    customer_id: customer.id,
    label: d.label ?? null,
    recipient: d.recipient,
    street: d.street,
    ext_no: d.extNo ?? null,
    int_no: d.intNo ?? null,
    neighborhood: d.neighborhood ?? null,
    city: d.city,
    state: d.state,
    postal_code: d.postalCode,
    country: 'MX',
    phone: d.phone ?? null,
    delivery_notes: d.deliveryNotes ?? null,
    is_default: d.isDefault,
  }

  const { error } = d.id
    ? await supabase.from('customer_addresses').update(row).eq('id', d.id)
    : await supabase.from('customer_addresses').insert(row)

  if (error) {
    console.error('[cuenta] no se pudo guardar la dirección:', error.message)
    return { ok: false, message: 'No pudimos guardar la dirección' }
  }

  revalidatePath('/cuenta')
  return { ok: true, message: d.id ? 'Dirección actualizada' : 'Dirección guardada' }
}

export async function deleteAddress(addressId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(addressId).success) {
    return { ok: false, message: 'Dirección inválida' }
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase.from('customer_addresses').delete().eq('id', addressId)

  if (error) return { ok: false, message: 'No pudimos eliminar la dirección' }

  revalidatePath('/cuenta')
  return { ok: true, message: 'Dirección eliminada' }
}

export async function setDefaultAddress(addressId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(addressId).success) {
    return { ok: false, message: 'Dirección inválida' }
  }

  const supabase = await createServerSupabase()
  // El trigger `customer_addresses_single_default` quita la marca de la
  // anterior: aquí no hay que limpiar nada a mano.
  const { error } = await supabase
    .from('customer_addresses')
    .update({ is_default: true })
    .eq('id', addressId)

  if (error) return { ok: false, message: 'No pudimos cambiar la dirección principal' }

  revalidatePath('/cuenta')
  return { ok: true, message: 'Dirección principal actualizada' }
}

export async function removeFromWishlist(productId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(productId).success) {
    return { ok: false, message: 'Pieza inválida' }
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('customer_favorites')
    .delete()
    .eq('product_id', productId)

  if (error) return { ok: false, message: 'No pudimos quitarla de tu lista' }

  revalidatePath('/cuenta')
  return { ok: true }
}
