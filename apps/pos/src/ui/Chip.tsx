import { Pressable, StyleSheet, Text, View } from 'react-native'

import { color, s, size, space, text } from '@/theme'

/**
 * El filtro de una lista: «Todos», «Por preparar», «Enviados».
 *
 * Es un `Button` con otra forma, pero no una variante suya: los botones del
 * mostrador miden 56 puntos de alto como mínimo porque se pulsan con prisa y
 * deciden dinero. Un filtro se pulsa despacio, vive en fila con otros cinco, y
 * si midiera 56 la lista empezaría a media pantalla.
 *
 * Mantiene el mínimo táctil de 44 —el suelo de accesibilidad— y marca lo
 * activo con el grosor del borde, no con color: la paleta es monocroma.
 */

interface ChipProps {
  label: string
  active: boolean
  onPress: () => void
  /** Contador a la derecha. `0` se pinta; `undefined` no. */
  count?: number
}

export function Chip({ label, active, onPress, count }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [f.chip, active && f.activo, pressed && !active && f.pulsado]}
    >
      <Text style={active ? s.labelStrong : s.label}>{label}</Text>
      {count !== undefined ? (
        <View style={[f.globo, active && f.globoActivo]}>
          <Text style={[f.globoTexto, active && f.globoTextoActivo]}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  )
}

const f = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: space.gutter,
    borderWidth: 1,
    borderColor: color['outline-variant'],
  },
  activo: { borderWidth: size.border, borderColor: color.primary },
  pulsado: { backgroundColor: color['vellum-neutral'] },
  globo: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    alignItems: 'center',
    backgroundColor: color['surface-container'],
  },
  globoActivo: { backgroundColor: color.primary },
  globoTexto: { ...text.labelUpper, fontSize: 11, color: color['text-muted'] },
  globoTextoActivo: { color: color['on-primary'] },
})
