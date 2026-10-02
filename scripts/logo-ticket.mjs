#!/usr/bin/env node
/**
 * Convierte el logotipo en la imagen de 1 bit que imprime el ticket.
 *
 * Se corre una vez (y otra si cambia el logo), no en cada build: el resultado
 * se versiona en `packages/core/src/logo-ticket.ts`. Así la tablet nunca
 * decodifica un PNG —Hermes no sabe, y meter una librería de imágenes para
 * esto sería absurdo— y el logo pesa lo que pesan sus bits (~2 KB).
 *
 * Decisiones de la conversión:
 *  - Se recorta el aire del PNG original y se escala a 320 puntos de ancho.
 *  - Se rellena con blanco hasta 384, el ancho útil de un rollo de 58 mm, con
 *    el logo centrado. Centrarlo con `ESC a` no sirve: muchas impresoras
 *    ignoran la alineación para imágenes raster.
 *  - Umbral, no tramado. El logo es tipografía geométrica de un solo color; el
 *    tramado (dithering) solo ensuciaría los bordes de las letras.
 *
 *     node scripts/logo-ticket.mjs
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const ORIGEN = join(RAIZ, 'logos lumane', 'Lumane_Logotipo-01.png')
const DESTINO = join(RAIZ, 'packages', 'core', 'src', 'logo-ticket.ts')

const ANCHO_PAPEL = 384
const ANCHO_LOGO = 320

const recortado = await sharp(ORIGEN)
  .flatten({ background: '#ffffff' })
  .trim({ threshold: 40 })
  .toBuffer()

const { data, info } = await sharp(recortado)
  .resize({ width: ANCHO_LOGO })
  .extend({
    left: (ANCHO_PAPEL - ANCHO_LOGO) / 2,
    right: (ANCHO_PAPEL - ANCHO_LOGO) / 2,
    background: '#ffffff',
  })
  .greyscale()
  .raw()
  .toBuffer({ resolveWithObject: true })

const { width, height } = info
const bytesPorFila = width / 8
const bits = new Uint8Array(bytesPorFila * height)

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    // 1 = punto negro. 128 parte justo entre el gris del antialias y el fondo.
    if (data[y * width + x] < 128) {
      bits[y * bytesPorFila + (x >> 3)] |= 0x80 >> (x & 7)
    }
  }
}

const filas = []
for (let i = 0; i < bits.length; i += 24) {
  filas.push('  ' + Array.from(bits.subarray(i, i + 24), (b) => `0x${b.toString(16).padStart(2, '0')}`).join(','))
}

writeFileSync(
  DESTINO,
  `/**
 * El logotipo de Lumane en 1 bit, ${width}×${height} puntos.
 *
 * GENERADO por \`scripts/logo-ticket.mjs\` desde \`logos lumane/Lumane_Logotipo-01.png\`.
 * No se edita a mano: si cambia el logo, se vuelve a correr el script.
 */
import type { RasterImage } from './escpos.ts'

export const LOGO_TICKET: RasterImage = {
  width: ${width},
  height: ${height},
  data: Uint8Array.from([
${filas.join(',\n')},
  ]),
}
`,
)

console.log(`logo-ticket.ts: ${width}×${height} (${bits.length} bytes)`)
