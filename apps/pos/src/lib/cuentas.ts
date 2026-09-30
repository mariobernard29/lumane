import * as SecureStore from 'expo-secure-store'

/**
 * Las cuentas que ya han entrado en ESTA tablet.
 *
 * Sirven al desplegable de la pantalla de ingreso: la cajera toca su nombre y
 * solo teclea la contraseña. En un mostrador, escribir un correo entero en una
 * pantalla táctil con la clienta esperando es justo el tipo de fricción que
 * acaba en contraseñas apuntadas en un papel al lado de la caja.
 *
 * **La lista es LOCAL y solo se llena con quien ha entrado bien aquí.** No se
 * consulta al servidor, y esa es la decisión importante: un RPC que devolviera
 * el personal de la boutique tendría que estar abierto a `anon` —la pantalla
 * de ingreso todavía no ha autenticado a nadie—, y la llave publicable viaja
 * dentro del APK. Cualquiera que lo descomprima podría pedir la lista completa
 * de nombres y correos de quien trabaja aquí, que es exactamente lo que se
 * necesita para un correo de phishing creíble.
 *
 * `signIn` ya evita decir si un correo existe («Correo o contraseña
 * incorrectos» para los dos casos) precisamente para no revelar quién trabaja
 * en la boutique. Una lista servida por el servidor tiraría esa decisión a la
 * basura desde la misma pantalla.
 *
 * El precio de hacerlo local es pequeño y se paga una sola vez: la primera vez
 * que alguien entra en una tablet recién instalada teclea su correo. A partir
 * de ahí ya está en el desplegable.
 */

export interface CuentaRecordada {
  email: string
  nombre: string
}

const CLAVE = 'lumane.cuentas'

/**
 * Tope de cuentas guardadas.
 *
 * No es una preferencia estética: `expo-secure-store` rechaza valores de más
 * de 2 048 bytes. Ocho cuentas rondan los 600, así que el tope deja margen de
 * sobra sin necesitar el troceado que sí hace falta para el token de sesión.
 */
const MAXIMO = 8

function normalizar(email: string): string {
  return email.trim().toLowerCase()
}

/** Las cuentas conocidas, de la más reciente a la más antigua. */
export async function leerCuentas(): Promise<CuentaRecordada[]> {
  try {
    const crudo = await SecureStore.getItemAsync(CLAVE)
    if (!crudo) return []

    const lista: unknown = JSON.parse(crudo)
    if (!Array.isArray(lista)) return []

    return lista.filter(
      (c): c is CuentaRecordada =>
        typeof c === 'object' &&
        c !== null &&
        typeof (c as CuentaRecordada).email === 'string' &&
        typeof (c as CuentaRecordada).nombre === 'string',
    )
  } catch {
    // Un JSON roto o un almacén ilegible NO pueden dejar fuera a la cajera:
    // sin lista, la pantalla pide el correo a mano y se entra igual. Por eso
    // se devuelve vacío en vez de propagar el fallo.
    return []
  }
}

/**
 * Apunta una cuenta que acaba de entrar bien, o actualiza su nombre.
 *
 * Se llama DESPUÉS de que el perfil de personal se haya leído, no al
 * autenticar: una clienta con cuenta en la tienda en línea puede autenticarse
 * en la tablet y no es personal, y no tiene por qué quedar en el desplegable
 * de la boutique.
 */
export async function recordarCuenta(email: string, nombre: string): Promise<void> {
  const correo = normalizar(email)
  if (correo === '') return

  const actuales = await leerCuentas()
  // La recién entrada va primera y sin duplicar. Reordenar en cada entrada
  // hace que el desplegable se ordene solo por quién usa más la tablet.
  const lista = [{ email: correo, nombre }, ...actuales.filter((c) => c.email !== correo)].slice(
    0,
    MAXIMO,
  )

  try {
    await SecureStore.setItemAsync(CLAVE, JSON.stringify(lista))
  } catch {
    // Que no se pueda recordar la cuenta es una molestia, no un fallo: la
    // sesión ya está abierta y la aplicación funciona igual.
  }
}

/** Quita una cuenta del desplegable. Para cuando alguien deja la boutique. */
export async function olvidarCuenta(email: string): Promise<CuentaRecordada[]> {
  const correo = normalizar(email)
  const resto = (await leerCuentas()).filter((c) => c.email !== correo)

  try {
    if (resto.length === 0) await SecureStore.deleteItemAsync(CLAVE)
    else await SecureStore.setItemAsync(CLAVE, JSON.stringify(resto))
  } catch {
    // Igual que arriba: no vale la pena romper la pantalla por esto.
  }

  return resto
}
