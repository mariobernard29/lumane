import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextInput,
  View,
} from 'react-native'
import { Redirect } from 'expo-router'

import { leerCuentas, olvidarCuenta, type CuentaRecordada } from '@/lib/cuentas'
import { useSession } from '@/lib/session'
import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { color, s, size, space, text } from '@/theme'

/**
 * Acceso del personal.
 *
 * Correo y contraseña, sin registro: al personal lo da de alta la propietaria.
 * Un POS con un botón de "crear cuenta" sería una puerta abierta a la caja.
 *
 * La sesión dura semanas en la tablet, así que esta pantalla se ve muy de
 * tarde en tarde. Por eso no se optimiza para la velocidad sino para no
 * equivocarse: campos grandes, un solo mensaje de error y nada más.
 *
 * **El desplegable de cuentas** evita teclear el correo entero en una pantalla
 * táctil. Sale de `lib/cuentas`, que solo guarda a quien ya entró bien en esta
 * tablet —nunca se consulta al servidor; el porqué está explicado allí—, así
 * que en una instalación nueva no aparece hasta la segunda entrada.
 */
export default function Ingresar() {
  const { signIn, staff, notStaff, signOut } = useSession()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const [cuentas, setCuentas] = useState<CuentaRecordada[]>([])
  const [elegida, setElegida] = useState<CuentaRecordada | null>(null)
  /** `true` cuando se teclea el correo a mano en vez de elegirlo. */
  const [aMano, setAMano] = useState(false)
  const [menuAbierto, setMenuAbierto] = useState(false)
  /**
   * Las cuentas se leen del almacén seguro, que es asíncrono. Sin esta espera
   * la pantalla pintaría un selector vacío durante un instante y saltaría
   * luego al campo de correo — un parpadeo que invita a tocar lo que se va a
   * mover. Es una lectura de milisegundos: nadie llega a ver el indicador.
   */
  const [cargandoCuentas, setCargandoCuentas] = useState(true)

  const contraseñaRef = useRef<TextInput>(null)

  useEffect(() => {
    let vivo = true

    void leerCuentas().then((lista) => {
      if (!vivo) return
      setCuentas(lista)
      setCargandoCuentas(false)

      if (lista.length === 0) {
        // Sin cuentas conocidas no hay desplegable que enseñar: la pantalla se
        // comporta como siempre y pide el correo.
        setAMano(true)
        return
      }

      // Se preselecciona la más reciente. En una boutique con una sola cajera
      // —el caso de hoy— eso convierte el ingreso en teclear la contraseña y
      // ya. El nombre se pinta grande justo encima para que quien comparta la
      // tablet vea de un vistazo que va a entrar con la cuenta de otra.
      setElegida(lista[0]!)
      setEmail(lista[0]!.email)
    })

    return () => {
      vivo = false
    }
  }, [])

  if (staff) return <Redirect href="/venta" />

  function elegir(cuenta: CuentaRecordada) {
    setElegida(cuenta)
    setEmail(cuenta.email)
    setAMano(false)
    setError(null)
    setMenuAbierto(false)
    // El foco se pide en el siguiente ciclo: la hoja todavía se está cerrando
    // y un `focus()` inmediato se pierde con el modal que desaparece.
    setTimeout(() => contraseñaRef.current?.focus(), 80)
  }

  async function olvidar(cuenta: CuentaRecordada) {
    const resto = await olvidarCuenta(cuenta.email)
    setCuentas(resto)

    if (elegida?.email !== cuenta.email) return

    // Se acaba de borrar la cuenta seleccionada: hay que dejar la pantalla en
    // un estado con el que se pueda entrar, no con un selector vacío.
    const siguiente = resto[0] ?? null
    setElegida(siguiente)
    setEmail(siguiente?.email ?? '')
    if (!siguiente) {
      setAMano(true)
      setMenuAbierto(false)
    }
  }

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
          ) : cargandoCuentas ? (
            <View style={a.cargando}>
              <ActivityIndicator color={color.primary} />
            </View>
          ) : (
            <>
              {aMano ? (
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
                    onSubmitEditing={() => contraseñaRef.current?.focus()}
                  />
                  {cuentas.length > 0 ? (
                    <Pressable
                      onPress={() => setMenuAbierto(true)}
                      accessibilityRole="button"
                      style={a.volver}
                    >
                      <Text style={a.enlace}>Elegir una cuenta guardada</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : (
                <View style={a.grupo}>
                  <Text style={s.label}>Cuenta</Text>
                  <Pressable
                    onPress={() => setMenuAbierto(true)}
                    disabled={enviando}
                    accessibilityRole="button"
                    accessibilityLabel={`Cuenta: ${elegida?.nombre ?? 'ninguna'}. Tocar para cambiar`}
                    style={({ pressed }) => [a.selector, pressed && a.selectorPulsado]}
                  >
                    <View style={s.fill}>
                      <Text style={s.body} numberOfLines={1}>
                        {elegida?.nombre ?? 'Elegir cuenta'}
                      </Text>
                      {elegida ? (
                        <Text style={a.correo} numberOfLines={1}>
                          {elegida.email}
                        </Text>
                      ) : null}
                    </View>
                    {/* Un triángulo de texto y no un icono: el sistema del POS
                        no tiene juego de iconos y traer uno para una flecha
                        sería una dependencia por un carácter. */}
                    <Text style={a.flecha}>▾</Text>
                  </Pressable>
                </View>
              )}

              <View style={a.espacio} />
              <Field
                ref={contraseñaRef}
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

      {menuAbierto ? (
        <Sheet
          eyebrow="Ingresar"
          title="Elegir cuenta"
          onClose={() => setMenuAbierto(false)}
          closeLabel="Volver"
        >
          {cuentas.map((cuenta) => (
            <View key={cuenta.email} style={a.filaCuenta}>
              <Pressable
                onPress={() => elegir(cuenta)}
                accessibilityRole="button"
                accessibilityLabel={`Entrar como ${cuenta.nombre}`}
                style={({ pressed }) => [a.filaToque, pressed && a.selectorPulsado]}
              >
                <Text style={s.bodyLg} numberOfLines={1}>
                  {cuenta.nombre}
                </Text>
                <Text style={a.correo} numberOfLines={1}>
                  {cuenta.email}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void olvidar(cuenta)}
                accessibilityRole="button"
                accessibilityLabel={`Olvidar la cuenta de ${cuenta.nombre}`}
                hitSlop={8}
                style={a.olvidar}
              >
                <Text style={a.enlace}>Olvidar</Text>
              </Pressable>
            </View>
          ))}

          <View style={a.espacio} />
          <Button
            label="Usar otro correo"
            variant="outline"
            size="lg"
            fullWidth
            onPress={() => {
              setAMano(true)
              setElegida(null)
              setEmail('')
              setError(null)
              setMenuAbierto(false)
            }}
          />
        </Sheet>
      ) : null}
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
  // La altura aproximada del formulario, para que la tarjeta no encoja y
  // vuelva a crecer cuando llega la lista.
  cargando: { height: 220, alignItems: 'center', justifyContent: 'center' },

  grupo: { gap: 6 },
  // Misma regla inferior que `s.input`, para que el selector y el campo de
  // contraseña se lean como dos filas del mismo formulario y no como un botón
  // encima de un campo.
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gap,
    borderBottomWidth: size.hairline,
    borderBottomColor: color['surface-variant'],
    paddingVertical: 12,
    minHeight: size.touchMin,
  },
  selectorPulsado: { backgroundColor: color['vellum-neutral'] },
  flecha: { ...text.bodyMd, fontSize: 18, color: color.secondary },
  correo: { ...text.bodyMd, fontSize: 13, color: color['text-muted'] },

  filaCuenta: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: size.hairline,
    borderBottomColor: color['surface-variant'],
  },
  filaToque: { flex: 1, minHeight: size.touchMin, justifyContent: 'center', paddingVertical: 10 },
  olvidar: { paddingLeft: space.gutter, paddingVertical: 10 },
  volver: { paddingTop: space.gap },
  enlace: { ...text.bodyMd, fontSize: 13, color: color.secondary, textDecorationLine: 'underline' },
})
