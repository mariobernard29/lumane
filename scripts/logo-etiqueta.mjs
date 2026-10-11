#!/usr/bin/env node
/**
 * Convierte el monograma de Lumane en las imágenes de 1 bit que imprime la
 * etiqueta de las prendas.
 *
 * Igual que `logo-ticket.mjs`: se corre una vez y el resultado se versiona en
 * `packages/core/src/logo-etiqueta.ts`. La tablet nunca decodifica un PNG.
 *
 * Varios tamaños y no uno escalado en la tablet: reducir un dibujo de 1 bit
 * por vecino más cercano rompe los trazos finos del monograma; sharp lo
 * reduce en gris con antialias y LUEGO se umbraliza, que es lo que se ve bien
 * en papel.
 *
 *     node scripts/logo-etiqueta.mjs
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const ORIGEN = join(RAIZ, 'apps', 'pos', 'assets', 'monograma-tinta.png')
const DESTINO = join(RAIZ, 'packages', 'core', 'src', 'logo-etiqueta.ts')

/** Alturas en puntos (8 por mm a 203 dpi): de 4 a 12 mm. */
const ALTURAS = [32, 48, 64, 80, 96]

const recortado = await sharp(ORIGEN)
  .flatten({ background: '#ffffff' })
  .trim({ threshold: 40 })
  .toBuffer()

const bloques = []
for (const alto of ALTURAS) {
  const { data, info } = await sharp(recortado)
    .resize({ height: alto })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  // Ancho redondeado a byte: TSPL y ESC/POS mandan filas de bytes completos.
  const ancho = Math.ceil(info.width / 8) * 8
  const bytesPorFila = ancho / 8
  const bits = new Uint8Array(bytesPorFila * info.height)
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[y * info.width + x] < 128) bits[y * bytesPorFila + (x >> 3)] |= 0x80 >> (x & 7)
    }
  }

  const filas = []
  for (let i = 0; i < bits.length; i += 24) {
    filas.push('    ' + Array.from(bits.subarray(i, i + 24), (b) => `0x${b.toString(16).padStart(2, '0')}`).join(','))
  }
  bloques.push(`  {\n    width: ${ancho},\n    height: ${info.height},\n    data: Uint8Array.from([\n${filas.join(',\n')},\n    ]),\n  }`)
}

writeFileSync(
  DESTINO,
  `/**
 * El monograma de Lumane en 1 bit, en ${ALTURAS.length} alturas (${ALTURAS.join(', ')} puntos).
 *
 * GENERADO por \`scripts/logo-etiqueta.mjs\` desde \`apps/pos/assets/monograma-tinta.png\`.
 * No se edita a mano: si cambia el monograma, se vuelve a correr el script.
 */
import type { RasterImage } from './escpos.ts'

/** De menor a mayor altura. */
export const MONOGRAMAS: readonly RasterImage[] = [
${bloques.join(',\n')},
]
`,
)

console.log(`Escrito ${DESTINO}: ${ALTURAS.length} tamaños`)
