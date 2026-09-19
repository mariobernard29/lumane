import * as SecureStore from 'expo-secure-store'
import { createClient, type LumaneClient } from '@lumane/db'

/**
 * El cliente de Supabase de la tablet.
 *
 * La sesión se guarda en el ALMACÉN SEGURO de Android (respaldado por el
 * Keystore), no en AsyncStorage: un token de personal abre la caja, el
 * inventario y el historial de ventas, y AsyncStorage es un archivo plano.
 * La tablet vive todo el día sobre un mostrador.
 *
 * La llave que viaja en el APK es la PUBLICABLE. Quien descompile la
 * aplicación no obtiene más acceso del que ya tiene cualquier visitante de la
 * tienda en línea: todo lo demás lo deciden las políticas RLS y los RPC contra
 * el usuario que haya iniciado sesión.
 */

/**
 * `expo-secure-store` rechaza valores de más de 2 048 bytes, y un JWT de
 * Supabase con el refresh token al lado los pasa. Este adaptador parte el
 * valor y deja en la clave original solo el número de trozos.
 *
 * Sin esto la sesión se guardaría a medias y la cajera tendría que volver a
 * entrar en cada arranque — un fallo que nadie relaciona con un límite de
 * tamaño porque no da ningún error visible.
 */
const TAMAÑO_TROZO = 1800
const MARCA_PARTIDO = '__lumane_chunks__:'

async function borrarTrozos(key: string): Promise<void> {
  const cabecera = await SecureStore.getItemAsync(key)
  if (cabecera === null || !cabecera.startsWith(MARCA_PARTIDO)) return

  const trozos = Number(cabecera.slice(MARCA_PARTIDO.length))
  for (let i = 0; i < trozos; i += 1) {
    await SecureStore.deleteItemAsync(`${key}.${i}`)
  }
}

const almacenSeguro = {
  async getItem(key: string): Promise<string | null> {
    const cabecera = await SecureStore.getItemAsync(key)
    if (cabecera === null) return null
    if (!cabecera.startsWith(MARCA_PARTIDO)) return cabecera

    const trozos = Number(cabecera.slice(MARCA_PARTIDO.length))
    const partes: string[] = []
    for (let i = 0; i < trozos; i += 1) {
      const parte = await SecureStore.getItemAsync(`${key}.${i}`)
      // Un trozo perdido daría un JSON roto que reventaría el arranque. Se
      // devuelve "no hay sesión", que sí sabemos manejar: pide entrar.
      if (parte === null) return null
      partes.push(parte)
    }
    return partes.join('')
  },

  async setItem(key: string, value: string): Promise<void> {
    await borrarTrozos(key)

    if (value.length <= TAMAÑO_TROZO) {
      await SecureStore.setItemAsync(key, value)
      return
    }

    const trozos = Math.ceil(value.length / TAMAÑO_TROZO)
    for (let i = 0; i < trozos; i += 1) {
      await SecureStore.setItemAsync(
        `${key}.${i}`,
        value.slice(i * TAMAÑO_TROZO, (i + 1) * TAMAÑO_TROZO),
      )
    }
    await SecureStore.setItemAsync(key, `${MARCA_PARTIDO}${trozos}`)
  },

  async removeItem(key: string): Promise<void> {
    await borrarTrozos(key)
    await SecureStore.deleteItemAsync(key)
  },
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  // Falla al arrancar, no en la primera consulta. Un POS que abre y luego dice
  // "no se pudo buscar" manda a la cajera a reiniciar la tablet, en vez de
  // avisar de que el APK se compiló sin variables.
  throw new Error(
    'Faltan EXPO_PUBLIC_SUPABASE_URL o EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. ' +
      'Copia apps/pos/.env.example a .env.local antes de compilar.',
  )
}

export const supabase: LumaneClient = createClient(url, key, {
  auth: {
    storage: almacenSeguro,
    autoRefreshToken: true,
    persistSession: true,
    // No hay URL de retorno en una aplicación nativa: no hay nada que detectar.
    detectSessionInUrl: false,
  },
})
