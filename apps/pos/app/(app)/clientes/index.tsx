import { useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'

import { CustomerPicker } from '@/features/customers/CustomerPicker'
import { CustomerSheet } from '@/features/customers/CustomerSheet'
import { useCustomerSearch, type ClientaEncontrada } from '@/features/customers/useCustomerSearch'
import { useSession } from '@/lib/session'
import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { color, s, size, space, text } from '@/theme'

/**
 * Clientas.
 *
 * Empieza vacía a propósito: una lista de todas las clientas no ayuda a
 * encontrar a ninguna. Se busca a quien está delante del mostrador, por su
 * nombre, su teléfono o su correo.
 *
 * Dar de alta reutiliza la misma hoja que el cobro. Es la misma operación y
 * mantenerla en un sitio evita que las dos altas pidan campos distintos.
 */
export default function Clientes() {
  const { can } = useSession()
  const [consulta, setConsulta] = useState('')
  const [abierta, setAbierta] = useState<string | null>(null)
  const [dandoAlta, setDandoAlta] = useState(false)

  const { resultados, buscando, error } = useCustomerSearch(consulta)

  return (
    <View style={c.pantalla}>
      <View style={c.cabecera}>
        <Field
          label="Buscar clienta"
          value={consulta}
          onChangeText={setConsulta}
          placeholder="Nombre, teléfono o correo"
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
        />
        {can('customers.write') ? (
          <Button label="Dar de alta" variant="outline" onPress={() => setDandoAlta(true)} />
        ) : null}
      </View>

      {error ? (
        <View style={c.error}>
          <Text style={s.body}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={resultados}
        keyExtractor={(r) => r.id}
        contentContainerStyle={c.lista}
        ItemSeparatorComponent={() => <View style={s.rule} />}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          buscando ? (
            <View style={c.vacio}>
              <ActivityIndicator color={color.primary} />
            </View>
          ) : (
            <View style={c.vacio}>
              <Text style={s.bodyMuted}>
                {consulta.trim() === ''
                  ? 'Escribe un nombre, un teléfono o un correo para buscar.'
                  : 'Ninguna clienta coincide.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => <Fila clienta={item} onPress={() => setAbierta(item.id)} />}
      />

      {abierta ? <CustomerSheet customerId={abierta} onClose={() => setAbierta(null)} /> : null}

      {dandoAlta ? (
        <CustomerPicker
          onClose={() => setDandoAlta(false)}
          onElegida={(id) => {
            // Tras darla de alta se abre su ficha: es lo que la cajera quiere
            // ver a continuación, y confirma que quedó guardada.
            setDandoAlta(false)
            setAbierta(id)
          }}
        />
      ) : null}
    </View>
  )
}

function Fila({ clienta, onPress }: { clienta: ClientaEncontrada; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Abrir la ficha de ${clienta.nombre}`}
      style={({ pressed }) => [c.fila, pressed && c.filaPulsada]}
    >
      <View style={s.fill}>
        <Text style={s.body}>{clienta.nombre || 'Sin nombre'}</Text>
        <Text style={c.meta}>
          {[clienta.phone, clienta.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
        </Text>
      </View>
    </Pressable>
  )
}

const c = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.surface },
  cabecera: {
    padding: space.edge,
    gap: space.gutter,
    borderBottomWidth: 1,
    borderBottomColor: color['surface-variant'],
    backgroundColor: color['paper-bright'],
  },
  lista: { paddingHorizontal: space.edge },
  fila: {
    minHeight: size.touchMin,
    justifyContent: 'center',
    paddingVertical: space.gap,
  },
  filaPulsada: { backgroundColor: color['vellum-neutral'] },
  meta: { ...text.bodyMd, fontSize: 12, color: color['text-muted'] },
  vacio: { paddingVertical: space.sectionMd, alignItems: 'center' },
  error: {
    margin: space.edge,
    borderWidth: 1,
    borderColor: color.primary,
    padding: space.gutter,
  },
})
