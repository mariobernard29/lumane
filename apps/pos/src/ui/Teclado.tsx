import { Pressable, StyleSheet, Text, View } from 'react-native'

import { color, size, space, text } from '@/theme'

/**
 * Teclado numérico en pantalla, como el de una calculadora.
 *
 * En el cobro no se abre el teclado del sistema: tapa media pantalla en
 * horizontal, cambia de forma según el campo y obliga a cerrarlo para ver el
 * botón de cobrar. Este vive dentro de la hoja, siempre en el mismo sitio, y
 * solo escribe importes.
 *
 * Trabaja sobre el TEXTO (`"1250.5"`), no sobre centavos: así se puede
 * escribir el punto y los decimales tal como se dicen en voz alta.
 */

type Tecla = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00' | '.' | 'borrar'
type Accion = Tecla | 'limpiar'

/**
 * Cuatro filas de cuatro, como una calculadora: una quinta fila no cabe en
 * los 600 dp de alto de una tablet de 8" junto al importe y los billetes.
 * El 0 ocupa tres huecos, como en una calculadora: es la tecla más grande
 * y la más fácil de atinar.
 */
const FILAS: { tecla: Accion; ancho?: number }[][] = [
  [{ tecla: '7' }, { tecla: '8' }, { tecla: '9' }, { tecla: 'borrar' }],
  [{ tecla: '4' }, { tecla: '5' }, { tecla: '6' }, { tecla: 'limpiar' }],
  [{ tecla: '1' }, { tecla: '2' }, { tecla: '3' }, { tecla: '00' }],
  [{ tecla: '0', ancho: 3 }, { tecla: '.' }],
]

const ETIQUETA: Partial<Record<Accion, string>> = { borrar: '⌫', limpiar: 'C' }
const ACCESIBLE: Partial<Record<Accion, string>> = {
  borrar: 'Borrar el último número',
  limpiar: 'Borrar todo',
  '.': 'Punto decimal',
}

/** Hasta $9,999,999.99: más que cualquier venta de la boutique. */
const MAX_ENTEROS = 7

/** Lo que queda en el campo tras pulsar una tecla. Pura, para poder probarla. */
export function teclear(valor: string, tecla: Tecla): string {
  if (tecla === 'borrar') return valor.slice(0, -1)

  const [enteros = '', decimales] = valor.split('.')

  if (tecla === '.') {
    if (valor.includes('.')) return valor
    return valor === '' ? '0.' : `${valor}.`
  }

  // Con decimales, solo caben dos.
  if (decimales !== undefined) {
    const nuevos = (decimales + tecla).slice(0, 2)
    return `${enteros}.${nuevos}`
  }

  // Sin ceros a la izquierda: «007» no es un importe.
  const siguiente = (enteros + tecla).replace(/^0+(?=\d)/, '')
  if (siguiente.length > MAX_ENTEROS) return valor
  return siguiente
}

export function Teclado({
  valor,
  onCambio,
  deshabilitado = false,
}: {
  valor: string
  onCambio: (v: string) => void
  deshabilitado?: boolean
}) {
  return (
    <View style={k.teclado}>
      {FILAS.map((fila, i) => (
        <View key={i} style={k.fila}>
          {fila.map(({ tecla, ancho }) => {
            const vacio = valor === ''
            return (
              <Boton
                key={tecla}
                etiqueta={ETIQUETA[tecla] ?? tecla}
                accesible={ACCESIBLE[tecla]}
                ancho={ancho}
                deshabilitado={deshabilitado || ((tecla === 'borrar' || tecla === 'limpiar') && vacio)}
                onPress={() => onCambio(tecla === 'limpiar' ? '' : teclear(valor, tecla))}
              />
            )
          })}
        </View>
      ))}
    </View>
  )
}

function Boton({
  etiqueta,
  onPress,
  deshabilitado,
  ancho = 1,
  accesible,
}: {
  etiqueta: string
  onPress: () => void
  deshabilitado: boolean
  ancho?: number
  accesible?: string
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitado}
      accessibilityRole="button"
      accessibilityLabel={accesible ?? etiqueta}
      // Una tecla ancha cubre también los huecos entre las que reemplaza: sin
      // esa base, el punto de la última fila no queda alineado con la columna
      // de arriba.
      style={({ pressed }) => [
        k.tecla,
        { flexGrow: ancho, flexShrink: 1, flexBasis: (ancho - 1) * space.gap },
        pressed && k.pulsada,
        deshabilitado && k.apagada,
      ]}
    >
      <Text style={k.numero}>{etiqueta}</Text>
    </Pressable>
  )
}

const k = StyleSheet.create({
  teclado: { gap: space.gap },
  fila: { flexDirection: 'row', gap: space.gap },
  tecla: {
    minHeight: size.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color['outline-variant'],
    backgroundColor: color['paper-bright'],
  },
  pulsada: { backgroundColor: color['vellum-neutral'], borderColor: color.primary },
  apagada: { opacity: 0.35 },
  numero: { ...text.headlineSm, color: color.primary },
})
