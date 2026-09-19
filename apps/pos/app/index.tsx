import { ActivityIndicator, View } from 'react-native'
import { Redirect } from 'expo-router'

import { useSession } from '@/lib/session'
import { color, s } from '@/theme'

/**
 * El guardia de la puerta.
 *
 * Mientras se resuelve la sesión guardada no se decide nada: enviar a la
 * pantalla de acceso durante ese instante haría parpadear el formulario en
 * cada arranque, aunque la cajera ya estuviera dentro.
 */
export default function Index() {
  const { loading, staff } = useSession()

  if (loading) {
    return (
      <View style={[s.screen, s.center]}>
        <ActivityIndicator color={color.primary} size="large" />
      </View>
    )
  }

  return staff ? <Redirect href="/venta" /> : <Redirect href="/ingresar" />
}
