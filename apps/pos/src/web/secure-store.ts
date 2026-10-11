/**
 * `expo-secure-store` para la vista previa en el navegador.
 *
 * SOLO para `expo start --web`, que sirve para mirar las pantallas desde la
 * computadora sin tablet ni emulador. El navegador no tiene Keystore, así que
 * la sesión va a `localStorage`: aceptable para revisar diseño, inaceptable en
 * la caja. Por eso Metro solo lo usa cuando la plataforma es web (ver
 * `metro.config.js`) y el APK nunca lo incluye.
 */
export async function getItemAsync(key: string): Promise<string | null> {
  return globalThis.localStorage?.getItem(key) ?? null
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  globalThis.localStorage?.setItem(key, value)
}

export async function deleteItemAsync(key: string): Promise<void> {
  globalThis.localStorage?.removeItem(key)
}
