import { useCallback, useEffect, useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { errorMessage } from '@lumane/db'

import type { DispositivoBt } from '../../../modules/impresora-bt'
import {
  buscarCercanas,
  cargarImpresora,
  dispositivosEmparejados,
  emparejar,
  guardarPreferencias,
  puedeBuscar,
  useImpresora,
} from '@/features/printer/impresora'
import { imprimirPrueba, olvidarCabecera } from '@/features/printer/tickets'
import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { color, s, size, space } from '@/theme'

/**
 * La impresora de caja.
 *
 * Se configura una vez por tablet: emparejar en Android, elegirla aquí,
 * imprimir la prueba. Lo demás —cuándo imprime sola, cuántas copias— son
 * interruptores, porque es lo que se toca cuando cambia la forma de trabajar,
 * no la impresora.
 */
export default function Impresora() {
  const { prefs, estado, error } = useImpresora()
  const [dispositivos, setDispositivos] = useState<DispositivoBt[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // Buscar y emparejar desde aquí: para cuando el PIN falla en los ajustes de Android.
  const [cercanas, setCercanas] = useState<DispositivoBt[] | null>(null)
  const [explorando, setExplorando] = useState(false)
  const [emparejando, setEmparejando] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [falloCerca, setFalloCerca] = useState<string | null>(null)

  async function explorar() {
    setExplorando(true)
    setFalloCerca(null)
    try {
      setCercanas(await buscarCercanas())
    } catch (e) {
      setFalloCerca(errorMessage(e as { message?: string }))
    } finally {
      setExplorando(false)
    }
  }

  async function emparejarCon(d: DispositivoBt) {
    setEmparejando(d.mac)
    setFalloCerca(null)
    setAviso(null)
    try {
      const listo = await emparejar(d.mac, pin)
      await guardarPreferencias({ mac: listo.mac, nombre: listo.nombre })
      setCercanas((l) => l?.filter((x) => x.mac !== d.mac) ?? null)
      setAviso('Emparejada y elegida. Imprime la página de prueba para comprobarla.')
      void buscar()
    } catch (e) {
      setFalloCerca(errorMessage(e as { message?: string }))
    } finally {
      setEmparejando(null)
    }
  }

  const buscar = useCallback(async () => {
    setBuscando(true)
    setFallo(null)
    try {
      setDispositivos(await dispositivosEmparejados())
    } catch (e) {
      setFallo(errorMessage(e as { message?: string }))
    } finally {
      setBuscando(false)
    }
  }, [])

  useEffect(() => {
    void cargarImpresora().then(() => {
      if (estado !== 'sin-modulo') void buscar()
    })
    // Solo al entrar: volver a listar en cada cambio de estado haría parpadear la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function prueba() {
    setAviso(null)
    setFallo(null)
    // La prueba es también la forma de ver un cambio hecho en Admin › Ajustes.
    olvidarCabecera()
    try {
      await imprimirPrueba()
      setAviso('Página de prueba impresa.')
    } catch (e) {
      setFallo(errorMessage(e as { message?: string }))
    }
  }

  if (estado === 'sin-modulo') {
    return (
      <View style={[s.screen, k.centro]}>
        <View style={k.tarjeta}>
          <Text style={s.label}>Impresora</Text>
          <Text style={[s.headlineMd, k.titulo]}>Hace falta actualizar la app</Text>
          <Text style={s.bodyMuted}>
            Esta versión del POS no incluye el módulo de impresora. Instala la versión más reciente
            en la tablet de caja.
          </Text>
        </View>
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={k.cuerpo}>
      <View style={k.columna}>
        <View style={k.tarjeta}>
          <Text style={s.label}>Impresora de tickets</Text>
          <Text style={[s.headlineMd, k.titulo]}>{prefs.nombre ?? 'Sin elegir'}</Text>
          <Text style={s.bodyMuted}>
            {estado === 'imprimiendo'
              ? 'Imprimiendo…'
              : estado === 'error'
                ? `Último intento: ${error ?? 'falló'}`
                : prefs.mac
                  ? 'Elegida. Se conecta sola al imprimir.'
                  : 'Elige la impresora de la lista.'}
          </Text>

          {fallo ? <Text style={[s.body, k.fallo]}>{fallo}</Text> : null}
          {aviso ? <Text style={[s.bodyMuted, k.aviso]}>{aviso}</Text> : null}

          <View style={k.espacio} />
          <Button
            label="Imprimir página de prueba"
            size="lg"
            fullWidth
            loading={estado === 'imprimiendo'}
            disabled={!prefs.mac || estado === 'imprimiendo'}
            onPress={() => void prueba()}
          />
        </View>

        <View style={k.tarjeta}>
          <Text style={s.label}>Cuándo imprime</Text>
          <Interruptor
            etiqueta="Ticket al cobrar"
            detalle="Sale solo en cuanto se registra la venta."
            valor={prefs.autoImprimir}
            onCambio={(v) => void guardarPreferencias({ autoImprimir: v })}
          />
          <Interruptor
            etiqueta="Corte al cerrar la caja"
            detalle="Para firmarlo y guardarlo con el efectivo."
            valor={prefs.imprimirCorte}
            onCambio={(v) => void guardarPreferencias({ imprimirCorte: v })}
          />
          <Interruptor
            etiqueta="Dos copias del ticket"
            detalle="Una para la clienta y otra para la tienda."
            valor={prefs.copias === 2}
            onCambio={(v) => void guardarPreferencias({ copias: v ? 2 : 1 })}
          />
        </View>
      </View>

      <View style={k.columna}>
        <View style={k.tarjeta}>
          <Text style={s.label}>Emparejadas con esta tablet</Text>
          <Text style={[s.bodyMuted, k.nota]}>
            ¿No aparece? Enciende la impresora y emparéjala en los ajustes de Bluetooth de Android
            (el PIN suele ser 0000 o 1234). Después vuelve y pulsa «Buscar otra vez».
          </Text>

          {dispositivos?.length === 0 ? (
            <Text style={s.bodyMuted}>No hay ningún aparato emparejado.</Text>
          ) : null}

          {dispositivos?.map((d) => {
            const elegida = d.mac === prefs.mac
            return (
              <Pressable
                key={d.mac}
                accessibilityRole="radio"
                accessibilityState={{ selected: elegida }}
                onPress={() => void guardarPreferencias({ mac: d.mac, nombre: d.nombre })}
                style={({ pressed }) => [k.fila, elegida && k.filaElegida, pressed && k.filaPulsada]}
              >
                <View style={s.fill}>
                  <Text style={s.body}>{d.nombre}</Text>
                  <Text style={s.bodyMuted}>{d.mac}</Text>
                </View>
                <Text style={s.label}>{elegida ? 'Elegida' : d.esImpresora ? 'Impresora' : ''}</Text>
              </Pressable>
            )
          })}

          <View style={k.espacio} />
          <View style={k.dos}>
            <View style={s.fill}>
              <Button
                label="Buscar otra vez"
                variant="outline"
                fullWidth
                loading={buscando}
                onPress={() => void buscar()}
              />
            </View>
            <View style={s.fill}>
              <Button
                label="Ajustes de Bluetooth"
                variant="outline"
                fullWidth
                onPress={() => void Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS')}
              />
            </View>
          </View>
        </View>

        {puedeBuscar() ? (
          <View style={k.tarjeta}>
            <Text style={s.label}>Emparejar desde aquí</Text>
            <Text style={[s.bodyMuted, k.nota]}>
              Si en los ajustes de Android el PIN no funcionó, búscala aquí: la app pone el PIN sola
              (prueba 0000, 1234 y otros de fábrica). Si la impresora usa otro, escríbelo; sale en su
              hoja de prueba, que se imprime manteniendo el botón de papel al encenderla.
            </Text>

            <Field
              label="PIN (opcional)"
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              maxLength={16}
              editable={!emparejando}
            />

            {falloCerca ? <Text style={[s.body, k.fallo]}>{falloCerca}</Text> : null}

            {cercanas?.length === 0 ? (
              <Text style={[s.bodyMuted, k.fallo]}>
                No apareció nada. Revisa que la impresora esté encendida, cerca, y que no esté conectada a
                otro teléfono.
              </Text>
            ) : null}

            {cercanas?.map((d) => (
              <Pressable
                key={d.mac}
                accessibilityRole="button"
                disabled={emparejando !== null}
                onPress={() => void emparejarCon(d)}
                style={({ pressed }) => [k.fila, pressed && k.filaPulsada]}
              >
                <View style={s.fill}>
                  <Text style={s.body}>{d.nombre}</Text>
                  <Text style={s.bodyMuted}>{d.mac}</Text>
                </View>
                <Text style={s.label}>
                  {emparejando === d.mac ? 'Emparejando…' : d.esImpresora ? 'Impresora · Emparejar' : 'Emparejar'}
                </Text>
              </Pressable>
            ))}

            <View style={k.espacio} />
            <Button
              label={explorando ? 'Buscando… (unos 15 s)' : 'Buscar impresoras cercanas'}
              variant="outline"
              fullWidth
              loading={explorando}
              disabled={explorando || emparejando !== null}
              onPress={() => void explorar()}
            />
          </View>
        ) : null}
      </View>
    </ScrollView>
  )
}

function Interruptor({
  etiqueta,
  detalle,
  valor,
  onCambio,
}: {
  etiqueta: string
  detalle: string
  valor: boolean
  onCambio: (v: boolean) => void
}) {
  return (
    <View style={k.interruptor}>
      <View style={s.fill}>
        <Text style={s.body}>{etiqueta}</Text>
        <Text style={s.bodyMuted}>{detalle}</Text>
      </View>
      <Switch
        value={valor}
        onValueChange={onCambio}
        trackColor={{ true: color.primary, false: color['surface-variant'] }}
        accessibilityLabel={etiqueta}
      />
    </View>
  )
}

const k = StyleSheet.create({
  centro: { alignItems: 'center', justifyContent: 'center', padding: space.edge },
  cuerpo: { flexDirection: 'row', gap: space.gutter, padding: space.edge },
  columna: { flex: 1, gap: space.gutter },
  tarjeta: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: color['paper-bright'],
    borderWidth: 1,
    borderColor: color.primary,
    padding: space.edge,
  },
  titulo: { marginTop: 4, marginBottom: space.gap },
  nota: { fontSize: 13, marginBottom: space.gap },
  espacio: { height: space.gutter },
  dos: { flexDirection: 'row', gap: space.gap },
  fallo: { marginTop: space.gap },
  aviso: { marginTop: space.gap },
  fila: {
    minHeight: size.touchMin,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gap,
    paddingHorizontal: space.gap,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: color['surface-variant'],
    marginTop: space.gap,
  },
  filaElegida: { borderWidth: size.border, borderColor: color.primary },
  filaPulsada: { backgroundColor: color['surface-variant'] },
  interruptor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gap,
    paddingVertical: 10,
  },
})
