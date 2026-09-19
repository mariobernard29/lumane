import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { useKeepAwake } from 'expo-keep-awake'
import { useFonts } from 'expo-font'

import { SessionProvider } from '@/lib/session'
import { color } from '@/theme'

/**
 * Raíz de la aplicación.
 *
 * Tres decisiones que no son evidentes:
 *
 * 1. **La pantalla no se apaga** (`useKeepAwake`). Una tablet que se bloquea a
 *    mitad de una venta obliga a desbloquearla con la clienta delante. El POS
 *    está enchufado al mostrador; la batería no es el problema aquí.
 *
 * 2. **Las fuentes se esperan.** Sin esto, la primera pantalla se pinta con la
 *    tipografía del sistema y salta a Figtree un instante después. En la web
 *    `next/font` lo resuelve solo; aquí hay que hacerlo a mano.
 *
 * 3. **La sesión envuelve TODO**, incluida la pantalla de acceso, porque es el
 *    propio proveedor quien decide si hace falta mostrarla.
 */

void SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  useKeepAwake()

  // Cada `.ttf` se pide por su ruta, no importando del paquete.
  //
  // `import { Figtree_400Regular } from '@expo-google-fonts/figtree'` pasa por
  // el índice del paquete, que declara las CATORCE variantes: Metro las mete
  // todas en el APK, 560 KB para usar cuatro. Pedirlas una a una baja eso a
  // 160 KB. En una tablet que se actualiza por OTA, cada megabyte es tiempo de
  // mostrador parado.
  const [fuentesListas, errorFuentes] = useFonts({
    Figtree_400Regular: require('@expo-google-fonts/figtree/400Regular/Figtree_400Regular.ttf'),
    Figtree_500Medium: require('@expo-google-fonts/figtree/500Medium/Figtree_500Medium.ttf'),
    Figtree_600SemiBold: require('@expo-google-fonts/figtree/600SemiBold/Figtree_600SemiBold.ttf'),
    Figtree_700Bold: require('@expo-google-fonts/figtree/700Bold/Figtree_700Bold.ttf'),
    InstrumentSerif_400Regular: require('@expo-google-fonts/instrument-serif/400Regular/InstrumentSerif_400Regular.ttf'),
  })

  useEffect(() => {
    // También se oculta si las fuentes fallan: una tienda no puede quedarse sin
    // cobrar porque una tipografía no cargó. Android caerá a la del sistema.
    if (fuentesListas || errorFuentes) void SplashScreen.hideAsync()
  }, [fuentesListas, errorFuentes])

  if (!fuentesListas && !errorFuentes) return null

  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.surface },
          animation: 'fade',
        }}
      />
    </SessionProvider>
  )
}
