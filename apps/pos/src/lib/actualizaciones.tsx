import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import Constants from 'expo-constants'
import * as Updates from 'expo-updates'
import { SafeAreaView } from 'react-native-safe-area-context'

import { supabase } from '@/lib/supabase'
import { Button } from '@/ui/Button'
import { color, s, space } from '@/theme'

/**
 * Avisar a la tablet de que hay una versión nueva.
 *
 * Hay dos clases de versión nueva, y la tablet necesita enterarse de las dos:
 *
 *  1. **Por aire** (`eas update`): JavaScript. expo-updates la busca al abrir
 *     la app, pero la tablet del mostrador NUNCA se cierra —está enchufada y
 *     con la pantalla encendida—, así que sin esto una corrección publicada el
 *     lunes llegaría el día que alguien la reinicie. Aquí se busca al volver a
 *     primer plano y cada 15 minutos; si hay una, se descarga en segundo plano
 *     y se PIDE reiniciar. No se reinicia sola: podría haber una venta a medias.
 *
 *  2. **APK nuevo**: un cambio nativo (permisos, orientación, Bluetooth) no
 *     viaja por aire. `pos_release` (migración 0075) dice cuál es la versión
 *     vigente y de dónde bajarla; si la de esta tablet es menor, se avisa con
 *     el botón de descarga.
 */

type Aviso = { tipo: 'reiniciar' } | { tipo: 'instalar'; version: string; url: string; notas: string | null }

const CADA_MS = 15 * 60 * 1000

/** La versión nativa de este APK: la de `app.json` con la que se compiló. */
export function versionInstalada(): string {
  return Updates.runtimeVersion ?? Constants.expoConfig?.version ?? '0.0.0'
}

/** `1.10.0` > `1.9.2`. Lo que no es número cuenta como 0. */
export function esMayor(a: string, b: string): boolean {
  const pa = a.split('.').map((x) => Number.parseInt(x, 10) || 0)
  const pb = b.split('.').map((x) => Number.parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return false
}

function useActualizaciones() {
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const ocupado = useRef(false)

  const revisar = useCallback(async () => {
    if (ocupado.current) return
    ocupado.current = true
    try {
      // Primero el APK: si hace falta uno nuevo, reiniciar no arregla nada.
      const { data } = await supabase.from('pos_release').select('version, apk_url, notas').maybeSingle()
      if (data && esMayor(data.version, versionInstalada())) {
        setAviso({
          tipo: 'instalar',
          version: data.version,
          url: data.apk_url,
          notas: data.notas,
        })
        return
      }

      // En desarrollo (Metro) y en Expo Go no hay actualizaciones por aire.
      if (!Updates.isEnabled || __DEV__) return
      const hay = await Updates.checkForUpdateAsync()
      if (!hay.isAvailable) return
      const bajada = await Updates.fetchUpdateAsync()
      if (bajada.isNew) setAviso({ tipo: 'reiniciar' })
    } catch {
      // Sin red o sin sesión: se vuelve a intentar en el siguiente turno.
    } finally {
      ocupado.current = false
    }
  }, [])

  useEffect(() => {
    void revisar()
    const intervalo = setInterval(() => void revisar(), CADA_MS)
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') void revisar()
    })
    return () => {
      clearInterval(intervalo)
      sub.remove()
    }
  }, [revisar])

  return { aviso, cerrar: () => setAviso(null) }
}

/**
 * La franja de aviso, arriba de todo. Negra como el carril: es la única
 * cosa del POS que interrumpe, y tiene que verse sin tapar la venta.
 */
export function AvisoActualizacion() {
  const { aviso, cerrar } = useActualizaciones()
  const [reiniciando, setReiniciando] = useState(false)
  if (!aviso) return null

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={a.fondo}>
      <View style={a.franja} accessibilityRole="alert">
        <View style={s.fill}>
          <Text style={[s.body, s.onDark]}>
            {aviso.tipo === 'reiniciar'
              ? 'Hay una versión nueva de Lumane POS lista.'
              : `Hay que instalar la versión ${aviso.version} de Lumane POS.`}
          </Text>
          <Text style={[s.label, a.detalle]}>
            {aviso.tipo === 'reiniciar'
              ? 'Se aplica al reiniciar la app (tarda unos segundos). Termina antes la venta en curso.'
              : (aviso.notas ?? 'Descarga el archivo e instálalo encima; no se pierde nada de la tablet.')}
          </Text>
        </View>
        <Pressable onPress={cerrar} accessibilityRole="button" style={a.despues}>
          <Text style={[s.label, a.detalle]}>Después</Text>
        </Pressable>
        {aviso.tipo === 'reiniciar' ? (
          <Button
            label="Actualizar ahora"
            variant="onDark"
            loading={reiniciando}
            onPress={() => {
              setReiniciando(true)
              void Updates.reloadAsync().catch(() => setReiniciando(false))
            }}
          />
        ) : (
          <Button label="Descargar" variant="onDark" onPress={() => void Linking.openURL(aviso.url)} />
        )}
      </View>
    </SafeAreaView>
  )
}

const a = StyleSheet.create({
  fondo: { backgroundColor: color['editorial-ink'] },
  franja: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gap,
    paddingHorizontal: space.gutter,
    paddingVertical: space.gap,
    backgroundColor: color['editorial-ink'],
  },
  detalle: { color: color['on-primary-container'], marginTop: 2 },
  despues: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.gap,
  },
})
