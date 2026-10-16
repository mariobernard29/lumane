import { useMemo } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import {
  buildEtiquetas,
  leerEtiqueta,
  pngDataUri,
  rasterizarEtiqueta,
  type AjustesEtiqueta,
  type DatosEtiqueta,
  type FormatoEtiqueta,
} from '@lumane/core'

import { color } from '@/theme'

/**
 * Cómo va a salir la etiqueta, punto por punto: se construye el TSPL que se
 * manda a la etiquetadora, se lee de vuelta y se pinta en una imagen de 1 bit
 * del tamaño de la etiqueta. Como los textos también viajan como imagen, lo
 * que se ve aquí es exactamente lo que sale; si el papel no coincide, el
 * fallo está en la impresora (medida, desplazamiento), no en la plantilla.
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
  const { uri, anchoPuntos, altoPuntos } = useMemo(() => {
    const leída = leerEtiqueta(buildEtiquetas([{ ...datos, copias: 1 }], formato, ajustes).bytes)
    const imagen = rasterizarEtiqueta(leída.anchoPuntos, leída.altoPuntos, leída.etiquetas[0]?.elementos ?? [])
    return { uri: pngDataUri(imagen), anchoPuntos: imagen.width, altoPuntos: leída.altoPuntos }
  }, [datos, formato, ajustes])
  const k = ancho / Math.max(1, anchoPuntos)

  return (
    <View
      style={[v.etiqueta, { width: ancho, height: altoPuntos * k }]}
      accessibilityRole="image"
      accessibilityLabel={`Vista previa de la etiqueta de ${datos.nombre}`}
    >
      <Image source={{ uri }} style={{ width: ancho, height: altoPuntos * k }} resizeMode="stretch" />
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
})
