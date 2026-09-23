import { useState } from 'react'
import { Image, KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Redirect } from 'expo-router'

import { useSession } from '@/lib/session'
import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { color, s, space } from '@/theme'

/**
 * Acceso del personal.
 *
 * Correo y contraseña, sin registro: al personal lo da de alta la propietaria.
 * Un POS con un botón de "crear cuenta" sería una puerta abierta a la caja.
 *
 * La sesión dura semanas en la tablet, así que esta pantalla se ve muy de
 * tarde en tarde. Por eso no se optimiza para la velocidad sino para no
 * equivocarse: campos grandes, un solo mensaje de error y nada más.
 */
export default function Ingresar() {
  const { signIn, staff, notStaff, signOut } = useSession()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (staff) return <Redirect href="/venta" />

  async function entrar() {
    if (!email.trim() || !password) {
      setError('Escribe tu correo y tu contraseña')
      return
    }

    setError(null)
    setEnviando(true)
    const resultado = await signIn(email, password)
    setEnviando(false)

    if (!resultado.ok) setError(resultado.message ?? 'No pudimos entrar')
    // Si salió bien no se navega desde aquí: el proveedor de sesión cambia de
    // estado y el `Redirect` de arriba se encarga. Navegar a mano además
    // dejaría la pantalla en la pila y el botón atrás volvería al formulario.
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={s.screen}>
      <ScrollView contentContainerStyle={a.contenedor} keyboardShouldPersistTaps="handled">
        <View style={a.tarjeta}>
          {/* El logotipo, no la palabra escrita con la tipografía de display.
              Es la única pantalla que ve alguien que todavía no ha entrado, y
              el trazo de la marca no se reproduce con una fuente. */}
          <Image
            source={require('../assets/logotipo-tinta.png')}
            style={a.logotipo}
            resizeMode="contain"
            accessibilityRole="image"
            accessibilityLabel="LUMANE"
          />
          <Text style={[s.label, a.marca]}>Punto de venta</Text>

          {notStaff ? (
            // Caso real: la propietaria prueba el POS con la cuenta que usa
            // para comprar en la tienda. Autenticó bien; simplemente no es
            // personal. Decirlo evita media hora buscando una contraseña que
            // no tiene nada de malo.
            <View style={a.aviso}>
              <Text style={s.body}>
                Esa cuenta existe, pero no es de personal de la boutique. Entra con el correo que
                te dio la propietaria.
              </Text>
              <View style={a.espacio} />
              <Button label="Usar otra cuenta" variant="outline" onPress={() => void signOut()} />
            </View>
          ) : (
            <>
              <Field
                label="Correo"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                inputMode="email"
                returnKeyType="next"
                editable={!enviando}
              />
              <View style={a.espacio} />
              <Field
                label="Contraseña"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                returnKeyType="go"
                onSubmitEditing={() => void entrar()}
                editable={!enviando}
                error={error}
              />
              <View style={a.espacio} />
              <Button
                label="Entrar"
                size="lg"
                fullWidth
                loading={enviando}
                onPress={() => void entrar()}
              />
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const a = StyleSheet.create({
  contenedor: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.edge,
  },
  tarjeta: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: color['paper-bright'],
    borderWidth: 1,
    borderColor: color.primary,
    padding: 32,
  },
  // El logotipo es 4398x1597 — proporción 2.75:1. La altura se fija y el ancho
  // se deja al `resizeMode`, para que no se deforme si mañana cambia el arte.
  logotipo: { width: 200, height: 73, marginBottom: 10 },
  marca: { marginBottom: 32 },
  espacio: { height: space.gutter },
  aviso: { gap: 4 },
})
