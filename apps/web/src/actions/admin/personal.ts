'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getStaffProfile } from '@/lib/queries/staff'
import { createAdminSupabase, createServerSupabase } from '@/lib/supabase/server'
import type { ResultadoAdmin } from './contenido.ts'

/**
 * Altas, bajas y cambios del personal, desde /admin/personal.
 *
 * **Aquí sí entra la llave de servicio, y solo para lo que SQL no puede
 * hacer:** crear la cuenta en `auth.users`, ponerle contraseña y bloquear su
 * sesión. Todo lo demás —nombre, rol, activo— va con la sesión por
 * `update_staff`, que comprueba en la base que quien lo pide es superusuaria
 * (migración 0076), igual que el resto del panel pasa por RLS.
 *
 * Antes de tocar la API de administración se pregunta a la base, con la
 * sesión, si quien llama es superusuaria. La llave de servicio salta todas las
 * reglas, así que esa comprobación es lo único que la separa de cualquiera con
 * sesión en el panel: no se quita.
 *
 * Y las contraseñas solo se cambian a quien aparece en `list_staff`: la misma
 * API cambiaría la de una clienta de la tienda, y eso no es asunto del panel.
 */

const ROLES = ['owner', 'manager', 'cashier'] as const

/** Un año entero de bloqueo, renovable: Auth no tiene «para siempre». */
const BLOQUEO = '876000h'

async function superusuaria() {
  const staff = await getStaffProfile()
  return staff?.is_superuser === true ? staff : null
}

const NO_AUTORIZADA: ResultadoAdmin = {
  ok: false,
  mensaje: 'Solo la cuenta principal de Lumane puede administrar al personal.',
}

const altaSchema = z.object({
  nombre: z.string().trim().min(2, 'Escribe el nombre completo'),
  correo: z.string().trim().toLowerCase().email('Ese correo no parece válido'),
  rol: z.enum(ROLES, { message: 'Elige un rol' }),
  contrasena: z.string().min(8, 'La contraseña necesita al menos 8 caracteres'),
})

export async function darDeAlta(formData: FormData): Promise<ResultadoAdmin> {
  if (!(await superusuaria())) return NO_AUTORIZADA

  const parsed = altaSchema.safeParse({
    nombre: formData.get('nombre'),
    correo: formData.get('correo'),
    rol: formData.get('rol'),
    contrasena: formData.get('contrasena'),
  })
  if (!parsed.success) return { ok: false, mensaje: parsed.error.issues[0]!.message }
  const { nombre, correo, rol, contrasena } = parsed.data

  const admin = createAdminSupabase()
  // El metadato es lo que lee el trigger de la 0038 para crear el perfil con
  // su rol, y lo que hace que el de la 0029 NO la registre como clienta.
  const { data, error } = await admin.auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
    user_metadata: { user_type: 'staff', role: rol, full_name: nombre },
  })

  if (error) {
    if (error.code === 'email_exists' || /already/i.test(error.message)) {
      return {
        ok: false,
        mensaje: `${correo} ya tiene una cuenta (quizá como clienta de la tienda). Usa otro correo para el personal.`,
      }
    }
    if (error.code === 'weak_password') {
      return { ok: false, mensaje: 'Esa contraseña es demasiado fácil. Usa una más larga o con números.' }
    }
    return { ok: false, mensaje: `No se pudo crear la cuenta: ${error.message}` }
  }

  // El perfil lo crea el trigger en la misma transacción que la cuenta; si no
  // está, algo cambió en la base y es mejor decirlo que dejar una cuenta que
  // no entra a ningún lado.
  const { data: perfil } = await admin.from('profiles').select('id').eq('id', data.user.id).maybeSingle()
  if (!perfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    return { ok: false, mensaje: 'La cuenta se creó sin perfil de personal y se deshizo. Avisa a soporte.' }
  }

  revalidatePath('/admin/personal')
  return { ok: true, mensaje: `${nombre} ya puede entrar al panel y a la tablet con ${correo}.` }
}

const cambioSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().trim().min(2, 'El nombre no puede quedar vacío'),
  rol: z.enum(ROLES, { message: 'Elige un rol' }),
})

export async function guardarPersona(formData: FormData): Promise<ResultadoAdmin> {
  const parsed = cambioSchema.safeParse({
    id: formData.get('id'),
    nombre: formData.get('nombre'),
    rol: formData.get('rol'),
  })
  if (!parsed.success) return { ok: false, mensaje: parsed.error.issues[0]!.message }

  const supabase = await createServerSupabase()
  const { error } = await supabase.rpc('update_staff', {
    p_id: parsed.data.id,
    p_full_name: parsed.data.nombre,
    p_role: parsed.data.rol,
  })
  if (error) return { ok: false, mensaje: error.message }

  revalidatePath('/admin/personal')
  return { ok: true, mensaje: 'Cambios guardados.' }
}

/**
 * Quitar o devolver el acceso. No se borra a nadie: sus ventas, cortes y
 * movimientos de inventario siguen firmados con su nombre.
 */
export async function cambiarAcceso(formData: FormData): Promise<ResultadoAdmin> {
  const id = String(formData.get('id') ?? '')
  const activa = formData.get('activa') === 'true'
  if (!z.string().uuid().safeParse(id).success) return { ok: false, mensaje: 'Falta la persona.' }

  // Primero la base: comprueba que es superusuaria quien lo pide, que la
  // persona es del personal y que no es la superusuaria misma.
  const supabase = await createServerSupabase()
  const { error } = await supabase.rpc('update_staff', { p_id: id, p_is_active: activa })
  if (error) return { ok: false, mensaje: error.message }

  // Después la sesión. Con el perfil inactivo ya no puede hacer nada (cada
  // permiso exige `is_active`); el bloqueo impide además que vuelva a entrar.
  const { error: errBloqueo } = await createAdminSupabase().auth.admin.updateUserById(id, {
    ban_duration: activa ? 'none' : BLOQUEO,
  })

  revalidatePath('/admin/personal')
  if (errBloqueo) {
    return {
      ok: true,
      mensaje: activa
        ? `Acceso devuelto en el sistema, pero la cuenta sigue bloqueada para entrar: ${errBloqueo.message}`
        : `Ya no tiene permisos, pero no se pudo cerrar su sesión: ${errBloqueo.message}`,
    }
  }
  return { ok: true, mensaje: activa ? 'Acceso devuelto.' : 'Acceso quitado. Ya no puede entrar.' }
}

const contrasenaSchema = z.object({
  id: z.string().uuid(),
  contrasena: z.string().min(8, 'La contraseña necesita al menos 8 caracteres'),
})

export async function nuevaContrasena(formData: FormData): Promise<ResultadoAdmin> {
  if (!(await superusuaria())) return NO_AUTORIZADA

  const parsed = contrasenaSchema.safeParse({ id: formData.get('id'), contrasena: formData.get('contrasena') })
  if (!parsed.success) return { ok: false, mensaje: parsed.error.issues[0]!.message }

  // Solo a alguien del personal, nunca a una clienta.
  const supabase = await createServerSupabase()
  const { data: lista, error: errLista } = await supabase.rpc('list_staff')
  if (errLista) return { ok: false, mensaje: errLista.message }
  if (!lista?.some((p) => p.id === parsed.data.id)) {
    return { ok: false, mensaje: 'Esa cuenta no es del personal.' }
  }

  const { error } = await createAdminSupabase().auth.admin.updateUserById(parsed.data.id, {
    password: parsed.data.contrasena,
  })
  if (error) {
    if (error.code === 'weak_password') {
      return { ok: false, mensaje: 'Esa contraseña es demasiado fácil. Usa una más larga o con números.' }
    }
    return { ok: false, mensaje: `No se pudo cambiar la contraseña: ${error.message}` }
  }

  return { ok: true, mensaje: 'Contraseña cambiada. Dísela en persona.' }
}
