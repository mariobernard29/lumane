import type { ReactNode } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { Button } from '@/ui/Button'
import { color, elevation, s, size, space } from '@/theme'

/**
 * La hoja que sube desde abajo.
 *
 * Estaba escrita a mano dentro de `ChargeSheet` y ahora la abren también
 * pedidos, devoluciones y el ticket. Cuatro copias del mismo velo y la misma
 * altura máxima es exactamente cómo cuatro pantallas acaban con cuatro
 * comportamientos distintos al pulsar fuera.
 *
 * Tres decisiones heredadas del cobro, que no son evidentes:
 *
 * 1. **El velo es un `View` con `flex: 1`, no una capa absoluta.** Así la hoja
 *    queda anclada abajo sin posicionamiento, y crece hacia arriba hasta su
 *    tope sin cálculos.
 *
 * 2. **El hueco de arriba es un `Pressable` que cierra.** Es el gesto que toda
 *    clienta espera y que en una tablet sobre el mostrador se alcanza mejor
 *    que un botón en la esquina.
 *
 * 3. **`maxHeight: 88%`.** Deja ver que hay algo detrás: una hoja a pantalla
 *    completa se confunde con una pantalla nueva, y entonces el botón atrás de
 *    Android se vuelve impredecible.
 */

interface SheetProps {
  /** Etiqueta pequeña sobre el título. */
  eyebrow: string
  /** El título grande. Se pinta con `displayXl` si es un importe. */
  title: string
  /** `true` cuando el título es dinero: cambia a la tipografía de precio. */
  titleIsMoney?: boolean
  onClose: () => void
  /** Texto del botón de cierre de la cabecera. */
  closeLabel?: string
  children: ReactNode
  /**
   * El botón de acción del pie. Sin esto la hoja es de solo lectura y el pie
   * no se pinta: una hoja con un pie vacío parece rota.
   */
  action?: {
    label: string
    onPress: () => void
    disabled?: boolean
    loading?: boolean
    variant?: 'solid' | 'outline' | 'danger'
  }
  /** Mensaje de error, dentro del cuerpo y al final. */
  error?: string | null
}

export function Sheet({
  eyebrow,
  title,
  titleIsMoney = false,
  onClose,
  closeLabel = 'Volver',
  children,
  action,
  error,
}: SheetProps) {
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={h.fondo}>
        <Pressable
          style={s.fill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={`Cerrar ${eyebrow.toLowerCase()}`}
        />

        <View style={[h.hoja, elevation]}>
          <View style={h.cabecera}>
            <View style={s.fill}>
              <Text style={s.label}>{eyebrow}</Text>
              <Text style={titleIsMoney ? s.priceDisplay : s.headlineMd} numberOfLines={2}>
                {title}
              </Text>
            </View>
            <Button label={closeLabel} variant="subtle" onPress={onClose} />
          </View>

          <ScrollView contentContainerStyle={h.cuerpo} keyboardShouldPersistTaps="handled">
            {children}

            {error ? (
              // Borde y no color: la paleta es monocroma a propósito y un rojo
              // aquí sería el único de toda la aplicación.
              <View style={h.error}>
                <Text style={s.body}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          {action ? (
            <View style={h.pie}>
              <Button
                label={action.label}
                size="charge"
                fullWidth
                variant={action.variant ?? 'solid'}
                loading={action.loading}
                disabled={action.disabled}
                onPress={action.onPress}
              />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}

const h = StyleSheet.create({
  // El único literal de color del POS, heredado del cobro: un velo tiene que
  // ser translúcido y ningún token lo es.
  fondo: { flex: 1, backgroundColor: 'rgba(10,10,10,0.45)' },
  hoja: {
    maxHeight: '88%',
    backgroundColor: color['paper-bright'],
    borderTopWidth: size.border,
    borderTopColor: color.primary,
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.gutter,
    padding: space.edge,
    borderBottomWidth: 1,
    borderBottomColor: color['surface-variant'],
  },
  cuerpo: { padding: space.edge, gap: space.gutter },
  error: { borderWidth: 1, borderColor: color.primary, padding: space.gutter },
  pie: { padding: space.edge, borderTopWidth: 1, borderTopColor: color['surface-variant'] },
})
