'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { readCartToken } from '@/lib/cart/session'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Autenticación de clientas.
 *
 * Los mensajes de error NUNCA distinguen entre "ese correo no existe" y "la
 * contraseña es incorrecta". Distinguirlos convierte el formulario en una
 * forma de averiguar quién es clienta de Lumane.
 */

export interface AuthResult {
  ok: boolean
  message?: string
  /** El registro terminó pero falta confirmar el correo. */
  needsConfirmation?: boolean
}

const CREDENTIALS_ERROR = 'Correo o contraseña incorrectos'

const signInSchema = z.object({
  email: z.email('Escribe un correo válido'),
  password: z.string().min(1, 'Escribe tu contraseña'),
  redirectTo: z.string().optional(),
})

export async function signIn(formData: FormData): Promise<AuthResult> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    redirectTo: formData.get('redirectTo') ?? undefined,
  })
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Revisa los datos' }
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    return { ok: false, message: CREDENTIALS_ERROR }
  }

  await mergeGuestCart()

  const target = safeRedirect(parsed.data.redirectTo)
  revalidatePath('/', 'layout')
  redirect(target)
}

const signUpSchema = z
  .object({
    firstName: z.string().min(2, 'Escribe tu nombre'),
    lastName: z.string().optional(),
    email: z.email('Escribe un correo válido'),
    // Ocho caracteres es el mínimo de Supabase. Se pide aquí también para que
    // el aviso salga antes de mandar la petición, no después.
    password: z.string().min(8, 'La contraseña necesita al menos 8 caracteres'),
    acceptsMarketing: z.boolean().default(false),
  })
  .strict()

export async function signUp(formData: FormData): Promise<AuthResult> {
  const parsed = signUpSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName') || undefined,
    email: formData.get('email'),
    password: formData.get('password'),
    acceptsMarketing: formData.get('acceptsMarketing') === 'on',
  })
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Revisa los datos' }
  }

  const supabase = await createServerSupabase()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // El trigger `auth_users_create_customer` lee estos datos para crear —o
      // vincular— la fila de clienta.
      data: {
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName ?? null,
        user_type: 'customer',
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
    },
  })

  if (error) {
    // "User already registered" tampoco se repite tal cual: confirmaría que
    // ese correo tiene cuenta en Lumane.
    return {
      ok: false,
      message:
        error.message.toLowerCase().includes('already')
          ? 'No pudimos crear la cuenta con ese correo. Si ya tienes una, inicia sesión.'
          : 'No pudimos crear tu cuenta. Vuelve a intentarlo.',
    }
  }

  if (parsed.data.acceptsMarketing) {
    await supabase
      .from('newsletter_subscribers')
      .upsert(
        { email: parsed.data.email, source: 'registro' },
        { onConflict: 'email', ignoreDuplicates: true },
      )
  }

  // Con confirmación de correo activada no hay sesión todavía.
  if (!data.session) {
    return { ok: true, needsConfirmation: true }
  }

  await mergeGuestCart()
  revalidatePath('/', 'layout')
  redirect('/cuenta')
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabase()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}

const emailSchema = z.object({ email: z.email('Escribe un correo válido') })

/**
 * Enlace para restablecer la contraseña.
 *
 * Responde lo mismo exista o no la cuenta: si dijera "ese correo no está
 * registrado", cualquiera podría comprobar quién compra en Lumane.
 */
export async function requestPasswordReset(formData: FormData): Promise<AuthResult> {
  const parsed = emailSchema.safeParse({ email: formData.get('email') })
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Revisa el correo' }
  }

  const supabase = await createServerSupabase()
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/restablecer`,
  })

  return {
    ok: true,
    message: 'Si ese correo tiene una cuenta, ahí llegará el enlace para cambiar la contraseña.',
  }
}

const passwordSchema = z
  .object({
    password: z.string().min(8, 'La contraseña necesita al menos 8 caracteres'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'Las contraseñas no coinciden',
    path: ['confirm'],
  })

export async function updatePassword(formData: FormData): Promise<AuthResult> {
  const parsed = passwordSchema.safeParse({
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  })
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Revisa los datos' }
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })

  if (error) {
    return {
      ok: false,
      message:
        'No pudimos cambiar la contraseña. El enlace pudo caducar: pide uno nuevo.',
    }
  }

  revalidatePath('/', 'layout')
  redirect('/cuenta')
}

/**
 * Fusiona la bolsa de invitada con la de la cuenta al entrar.
 *
 * Perder el carrito al iniciar sesión pierde la venta, y es justo el momento en
 * que más gente entra: cuando ya decidió comprar.
 */
async function mergeGuestCart(): Promise<void> {
  const token = await readCartToken()
  if (!token) return

  const supabase = await createServerSupabase()
  const { error } = await supabase.rpc('merge_cart', { p_token: token })
  if (error) {
    console.error('[auth] no se pudo fusionar la bolsa:', error.message)
  }
}

/**
 * Solo rutas internas. Sin esto, un `?redirect=https://otro-sitio.mx` en el
 * enlace de acceso convertiría el formulario de Lumane en un trampolín para
 * llevarse a la clienta a una copia falsa de la tienda.
 */
function safeRedirect(target: string | undefined): string {
  if (!target) return '/cuenta'
  if (!target.startsWith('/') || target.startsWith('//')) return '/cuenta'
  return target
}
