import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { errorMessage } from '@lumane/db'

import { supabase } from '@/lib/supabase'
import { useSession } from '@/lib/session'
import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { color, s, size, space, text } from '@/theme'
import { useCustomerSearch } from './useCustomerSearch.ts'

/**
 * Buscar o dar de alta una clienta, desde el cobro.
 *
 * **El alta es de dos campos**: nombre y correo. Pedir más en el mostrador, con
 * gente esperando, produce fichas a medias que nadie vuelve a completar. Lo
 * demás se rellena solo con el tiempo: el correo del ticket, la dirección del
 * primer envío.
 *
 * Buscar y dar de alta comparten pantalla porque son el mismo gesto: la cajera
 * teclea un nombre, y o aparece o lo crea. Separarlos obligaría a decidir
 * antes de saber la respuesta.
 *
 * `pos_upsert_customer` no falla por correo repetido: devuelve la ficha que ya
 * existía. Así «dar de alta» a alguien que ya estaba la encuentra, en lugar de
 * enseñar un error de clave duplicada.
 */

export function CustomerPicker({
  onClose,
  onElegida,
}: {
  onClose: () => void
  onElegida: (id: string, nombre: string, email: string | null) => void
}) {
  const { can } = useSession()
  const [consulta, setConsulta] = useState('')
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { resultados, buscando, error: errorBusqueda } = useCustomerSearch(consulta)
  const puedeCrear = can('customers.write')

  async function crear() {
    if (nombre.trim() === '') {
      setError('Escribe al menos el nombre')
      return
    }
    setEnviando(true)
    setError(null)

    const { data, error: fallo } = await supabase.rpc('pos_upsert_customer', {
      p_payload: { first_name: nombre.trim(), email: correo.trim() || null },
    })

    setEnviando(false)
    if (fallo) {
      setError(errorMessage(fallo))
      return
    }

    const clienta = data as unknown as {
      id: string
      first_name: string | null
      last_name: string | null
      email: string | null
      ya_existia: boolean
    }
    onElegida(
      clienta.id,
      [clienta.first_name, clienta.last_name].filter(Boolean).join(' ') || nombre.trim(),
      clienta.email,
    )
    onClose()
  }

  return (
    <Sheet
      eyebrow="Venta"
      title={creando ? 'Dar de alta' : 'Buscar clienta'}
      onClose={onClose}
      closeLabel={creando ? 'Volver a buscar' : 'Sin clienta'}
      action={
        creando
          ? {
              label: enviando ? 'Guardando…' : 'Dar de alta y asociar',
              onPress: () => void crear(),
              loading: enviando,
              disabled: nombre.trim() === '',
            }
          : undefined
      }
      error={error ?? errorBusqueda}
    >
      {creando ? (
        <View style={p.formulario}>
          <Field
            label="Nombre"
            value={nombre}
            onChangeText={setNombre}
            autoFocus
            autoCapitalize="words"
            editable={!enviando}
          />
          <Field
            label="Correo (opcional)"
            value={correo}
            onChangeText={setCorreo}
            autoCapitalize="none"
            keyboardType="email-address"
            inputMode="email"
            editable={!enviando}
            hint="Si ya hay una clienta con ese correo, se usa la suya en lugar de crear otra."
          />
        </View>
      ) : (
        <>
          <Field
            label="Buscar"
            value={consulta}
            onChangeText={setConsulta}
            placeholder="Nombre, teléfono o correo"
            autoFocus
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="search"
          />

          {resultados.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => {
                onElegida(r.id, r.nombre, r.email)
                onClose()
              }}
              accessibilityRole="button"
              accessibilityLabel={`Elegir a ${r.nombre}`}
              style={({ pressed }) => [p.fila, pressed && p.filaPulsada]}
            >
              <View style={s.fill}>
                <Text style={s.body}>{r.nombre || 'Sin nombre'}</Text>
                <Text style={p.meta}>
                  {[r.phone, r.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                </Text>
              </View>
            </Pressable>
          ))}

          {!buscando && consulta.trim() !== '' && resultados.length === 0 ? (
            <Text style={s.bodyMuted}>Ninguna clienta con ese nombre.</Text>
          ) : null}

          {puedeCrear ? (
            <Button
              label="Dar de alta una nueva"
              variant="outline"
              size="lg"
              fullWidth
              onPress={() => {
                setError(null)
                // Lo tecleado en la búsqueda pasa al nombre: quien escribió
                // «Ana Torres» y no la encontró está a un toque de crearla.
                setNombre(consulta.trim())
                setCreando(true)
              }}
            />
          ) : null}
        </>
      )}
    </Sheet>
  )
}

const p = StyleSheet.create({
  formulario: { gap: space.gutter },
  fila: {
    minHeight: size.touchMin,
    justifyContent: 'center',
    paddingVertical: space.gap,
    borderBottomWidth: 1,
    borderBottomColor: color['surface-variant'],
  },
  filaPulsada: { backgroundColor: color['vellum-neutral'] },
  meta: { ...text.bodyMd, fontSize: 12, color: color['text-muted'] },
})
