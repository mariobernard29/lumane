import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { normalizarCodigo, PRESETS_OPCIONES, sugerirCodigo, type OpcionProducto } from '@lumane/core'

import { Button } from '@/ui/Button'
import { Chip } from '@/ui/Chip'
import { Field } from '@/ui/Field'
import { color, s, size, space, text } from '@/theme'

/**
 * Las opciones de una prenda —talla, color, tamaño— y sus valores.
 *
 * Cada valor lleva su sufijo para el código («Chica» → CH). Se propone solo
 * al añadirlo y se puede cambiar: la tienda puede tener ya su convención.
 * Hasta tres opciones, que es lo que da una combinación legible en el ticket.
 */

const MAX_OPCIONES = 3

export function OpcionesEditor({
  opciones,
  onChange,
}: {
  opciones: OpcionProducto[]
  onChange: (o: OpcionProducto[]) => void
}) {
  const [otra, setOtra] = useState('')

  const nombres = opciones.map((o) => o.name.toLowerCase())
  const presetsLibres = Object.keys(PRESETS_OPCIONES).filter((n) => !nombres.includes(n.toLowerCase()))

  function agregarOpcion(nombre: string) {
    const limpio = nombre.trim()
    if (!limpio || nombres.includes(limpio.toLowerCase()) || opciones.length >= MAX_OPCIONES) return
    onChange([...opciones, { name: limpio, values: [] }])
    setOtra('')
  }

  function cambiar(i: number, o: OpcionProducto) {
    onChange(opciones.map((x, j) => (j === i ? o : x)))
  }

  function quitar(i: number) {
    onChange(opciones.filter((_, j) => j !== i))
  }

  return (
    <View style={e.bloque}>
      {opciones.map((o, i) => (
        <TarjetaOpcion
          key={o.name}
          opcion={o}
          onChange={(nueva) => cambiar(i, nueva)}
          onQuitar={() => quitar(i)}
        />
      ))}

      {opciones.length < MAX_OPCIONES ? (
        <View style={e.agregar}>
          <Text style={s.label}>{opciones.length === 0 ? 'Agregar opción' : 'Otra opción'}</Text>
          <View style={e.chips}>
            {presetsLibres.map((n) => (
              <Chip key={n} label={`+ ${n}`} active={false} onPress={() => agregarOpcion(n)} />
            ))}
          </View>
          <View style={e.filaCampo}>
            <View style={s.fill}>
              <Field
                label="Otra"
                value={otra}
                onChangeText={setOtra}
                placeholder="Largo, material…"
                returnKeyType="done"
                onSubmitEditing={() => agregarOpcion(otra)}
              />
            </View>
            <Button label="Agregar" variant="outline" disabled={!otra.trim()} onPress={() => agregarOpcion(otra)} />
          </View>
          {opciones.length === 0 ? (
            <Text style={s.bodyMuted}>
              Sin opciones, la prenda tiene una sola variante con el código base.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

function TarjetaOpcion({
  opcion,
  onChange,
  onQuitar,
}: {
  opcion: OpcionProducto
  onChange: (o: OpcionProducto) => void
  onQuitar: () => void
}) {
  const [nuevo, setNuevo] = useState('')

  const existentes = opcion.values.map((v) => v.value.toLowerCase())
  const presets = (PRESETS_OPCIONES[opcion.name] ?? []).filter((p) => !existentes.includes(p.toLowerCase()))

  function agregar(valor: string) {
    const limpio = valor.trim()
    if (!limpio || existentes.includes(limpio.toLowerCase())) return
    onChange({ ...opcion, values: [...opcion.values, { value: limpio, code: sugerirCodigo(limpio) }] })
    setNuevo('')
  }

  return (
    <View style={e.tarjeta}>
      <View style={e.cabeza}>
        <Text style={s.labelStrong}>{opcion.name}</Text>
        <Button label="Quitar opción" variant="subtle" onPress={onQuitar} />
      </View>

      {opcion.values.map((v, i) => (
        <View key={v.value} style={e.valor}>
          <Text style={[s.body, s.fill]}>{v.value}</Text>
          <Text style={s.label}>Código</Text>
          <TextInput
            value={v.code}
            onChangeText={(t) =>
              onChange({
                ...opcion,
                values: opcion.values.map((x, j) => (j === i ? { ...x, code: normalizarCodigo(t) } : x)),
              })
            }
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            style={e.codigo}
            accessibilityLabel={`Código de ${v.value}`}
          />
          <Pressable
            onPress={() => onChange({ ...opcion, values: opcion.values.filter((_, j) => j !== i) })}
            accessibilityRole="button"
            accessibilityLabel={`Quitar ${v.value}`}
            style={({ pressed }) => [e.quitar, pressed && e.quitarPulsado]}
          >
            <Text style={s.label}>Quitar</Text>
          </Pressable>
        </View>
      ))}

      {presets.length > 0 ? (
        <View style={e.chips}>
          {presets.map((p) => (
            <Chip key={p} label={`+ ${p}`} active={false} onPress={() => agregar(p)} />
          ))}
        </View>
      ) : null}

      <View style={e.filaCampo}>
        <View style={s.fill}>
          <Field
            label={`Nuevo valor de ${opcion.name.toLowerCase()}`}
            value={nuevo}
            onChangeText={setNuevo}
            placeholder={opcion.name === 'Color' ? 'Verde olivo' : 'Valor'}
            returnKeyType="done"
            onSubmitEditing={() => agregar(nuevo)}
            blurOnSubmit={false}
          />
        </View>
        <Button label="Agregar" variant="outline" disabled={!nuevo.trim()} onPress={() => agregar(nuevo)} />
      </View>
    </View>
  )
}

const e = StyleSheet.create({
  bloque: { gap: space.gutter },
  tarjeta: { borderWidth: 1, borderColor: color['outline-variant'], padding: space.gutter, gap: space.gap },
  cabeza: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  valor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gap,
    minHeight: size.touchMin,
    borderBottomWidth: 1,
    borderBottomColor: color['surface-variant'],
  },
  codigo: {
    ...text.bodyMd,
    width: 84,
    minHeight: 40,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: color['outline-variant'],
    color: color.primary,
    textAlign: 'center',
  },
  quitar: { minHeight: 40, justifyContent: 'center', paddingHorizontal: space.gap },
  quitarPulsado: { backgroundColor: color['vellum-neutral'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gap },
  agregar: { gap: space.gap },
  filaCampo: { flexDirection: 'row', alignItems: 'flex-end', gap: space.gap },
})
