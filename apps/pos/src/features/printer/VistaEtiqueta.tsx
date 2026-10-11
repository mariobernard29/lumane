import { useMemo } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import {
  buildEtiquetas,
  leerEtiqueta,
  type AjustesEtiqueta,
  type DatosEtiqueta,
  type FormatoEtiqueta,
} from '@lumane/core'

import { color } from '@/theme'

/**
 * Cómo va a salir la etiqueta, dibujada con los MISMOS bytes que se mandan a
 * la etiquetadora: se construye el TSPL y se lee de vuelta a cajas. Si la
 * vista y el papel no coinciden, el fallo está en la impresora (medida,
 * desplazamiento), no en la plantilla.
 *
 * Los textos usan la monoespaciada de Android con el ancho de las fuentes de
 * la impresora; el código de barras se pinta como franjas, no como un código
 * real: es una vista, no algo que haya que escanear.
 */
export function VistaEtiqueta({
  datos,
  formato,
  ajustes,
  ancho,
}: {
  datos: DatosEtiqueta
  formato: Pick<FormatoEtiqueta, 'anchoMm' | 'altoMm' | 'separacionMm'>
  ajustes?: AjustesEtiqueta
  /** Ancho en pantalla, en dp. */
  ancho: number
}) {
  const leída = useMemo(
    () => leerEtiqueta(buildEtiquetas([{ ...datos, copias: 1 }], formato, ajustes).bytes),
    [datos, formato, ajustes],
  )
  const k = ancho / leída.anchoPuntos
  const elementos = leída.etiquetas[0]?.elementos ?? []

  return (
    <View
      style={[v.etiqueta, { width: ancho, height: leída.altoPuntos * k }]}
      accessibilityRole="image"
      accessibilityLabel={`Vista previa de la etiqueta de ${datos.nombre}`}
    >
      {elementos.map((e, i) => {
        const caja = {
          left: e.x * k,
          top: e.y * k,
          width: e.ancho * k,
          height: e.alto * k,
        }
        switch (e.tipo) {
          case 'texto':
            return (
              <Text
                key={i}
                numberOfLines={1}
                style={[
                  v.texto,
                  caja,
                  // Monoespaciada: cada carácter mide ~0.6 de su tamaño, igual
                  // que las fuentes de la impresora miden su ancho en puntos.
                  {
                    fontSize: (e.ancho / Math.max(1, [...e.contenido].length) / 0.6) * k,
                    lineHeight: e.alto * k,
                  },
                ]}
              >
                {e.contenido}
              </Text>
            )
          case 'imagen':
            return (
              <Image
                key={i}
                source={require('../../../assets/monograma-etiqueta.png')}
                style={[v.abs, caja]}
                resizeMode="contain"
              />
            )
          case 'codigo':
            return <Franjas key={i} caja={caja} modulo={e.modulo * k} />
          case 'barra':
            return <View key={i} style={[v.abs, caja, v.negro]} />
          case 'caja':
            return <View key={i} style={[v.abs, caja, v.borde]} />
        }
      })}
    </View>
  )
}

function Franjas({
  caja,
  modulo,
}: {
  caja: { left: number; top: number; width: number; height: number }
  modulo: number
}) {
  const barras: { x: number; w: number }[] = []
  // Un patrón fijo de anchos 1-2-3: parece un código y no engaña a nadie.
  for (let x = 0, n = 0; x < caja.width; n++) {
    const w = Math.max(1, ((n * 7) % 3) + 1) * modulo
    if (n % 2 === 0) barras.push({ x, w })
    x += w
  }
  return (
    <View style={[v.abs, caja]}>
      {barras.map((b, i) => (
        <View key={i} style={[v.abs, v.negro, { left: b.x, top: 0, width: b.w, height: caja.height }]} />
      ))}
    </View>
  )
}

const v = StyleSheet.create({
  etiqueta: {
    backgroundColor: color['paper-bright'],
    borderWidth: 1,
    borderColor: color['outline-variant'],
    borderRadius: 4,
    overflow: 'hidden',
  },
  abs: { position: 'absolute' },
  texto: {
    position: 'absolute',
    fontFamily: 'monospace',
    color: color.primary,
    includeFontPadding: false,
  },
  negro: { backgroundColor: color.primary },
  borde: { borderWidth: 1, borderColor: color.primary },
})
