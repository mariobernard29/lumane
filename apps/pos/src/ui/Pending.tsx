import { StyleSheet, Text, View } from 'react-native'

import { s, space } from '@/theme'

/**
 * Módulo previsto pero no construido todavía.
 *
 * Dice QUÉ va a hacer y CUÁNDO, en lugar de un "próximamente" vacío. La tablet
 * la va a usar la propietaria antes que nadie y merece saber si algo falta
 * porque no toca aún o porque se rompió.
 */
export function Pending({ title, summary, items }: { title: string; summary: string; items: string[] }) {
  return (
    <View style={p.marco}>
      <View style={p.tarjeta}>
        <Text style={s.label}>En construcción</Text>
        <Text style={[s.headlineLg, p.titulo]}>{title}</Text>
        <Text style={s.bodyMuted}>{summary}</Text>
        <View style={p.lista}>
          {items.map((item) => (
            <Text key={item} style={s.body}>
              · {item}
            </Text>
          ))}
        </View>
      </View>
    </View>
  )
}

const p = StyleSheet.create({
  marco: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.edge },
  tarjeta: { maxWidth: 560, gap: 4 },
  titulo: { marginTop: 4, marginBottom: space.gap },
  lista: { marginTop: space.gutter, gap: 6 },
})
