#!/usr/bin/env node
/**
 * Las letras de la etiqueta de prendas: Figtree en 1 bit, a varios tamaños.
 *
 * La Hanna58 no respeta las fuentes residentes de TSPL: pide la «3» o la «4»
 * y sale la misma letra de 12 puntos que la «2». Lo que sí imprime tal cual
 * es un `BITMAP` (el monograma sale exacto), así que los textos de la
 * etiqueta se componen en la tablet con estas letras y viajan como imagen.
 *
 * Igual que `logo-etiqueta.mjs`: se corre una vez y el resultado se versiona
 * en `packages/core/src/letra-etiqueta.ts`. Cada glifo se dibuja en gris con
 * antialias al tamaño final y LUEGO se umbraliza, que es lo que se ve bien en
 * papel térmico; escalar un glifo de 1 bit en la tablet rompería los trazos.
 *
 *     node scripts/letra-etiqueta.mjs
 */
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import opentype from 'opentype.js'
import sharp from 'sharp'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const DESTINO = join(RAIZ, 'packages', 'core', 'src', 'letra-etiqueta.ts')
const FIGTREE = dirname(
  createRequire(join(RAIZ, 'apps', 'pos', 'package.json')).resolve('@expo-google-fonts/figtree/package.json'),
)

const ASCII = Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)).join('')
const TODOS = ASCII + 'áéíóúÁÉÍÓÚñÑüÜ¿¡°ºª´·–—‘’“”…€×'

/**
 * Tamaños en puntos por eme (8 puntos = 1 mm). La mayúscula de Figtree mide
 * 0.7 eme: 24 → 2.1 mm, 64 → 5.6 mm. El ExtraBold es solo para el precio.
 */
const PESOS = {
  bold: {
    archivo: '700Bold/Figtree_700Bold.ttf',
    tamaños: [14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40],
    caracteres: TODOS,
  },
  extrabold: {
    archivo: '800ExtraBold/Figtree_800ExtraBold.ttf',
    tamaños: [20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 64, 72],
    caracteres: '$0123456789,.',
  },
}

async function glifo(fuente, caracter, tamaño) {
  const g = fuente.charToGlyph(caracter)
  const avance = (g.advanceWidth * tamaño) / fuente.unitsPerEm
  const camino = g.getPath(0, 0, tamaño)
  const caja = camino.getBoundingBox()
  if (!(caja.x2 > caja.x1 && caja.y2 > caja.y1)) return { avance, x: 0, y: 0, ancho: 0, alto: 0, bits: [] }

  const x0 = Math.floor(caja.x1) - 1
  const y0 = Math.floor(caja.y1) - 1
  const w = Math.ceil(caja.x2) - x0 + 1
  const h = Math.ceil(caja.y2) - y0 + 1
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x0} ${y0} ${w} ${h}"><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#fff"/><path d="${camino.toPathData(3)}" fill="#000"/></svg>`
  const { data, info } = await sharp(Buffer.from(svg), { density: 72 })
    .flatten({ background: '#ffffff' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  // Recorte a la tinta: el glifo se guarda justo y con su desfase al origen.
  let izq = info.width, der = -1, arr = info.height, aba = -1
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[y * info.width + x] < 128) {
        izq = Math.min(izq, x); der = Math.max(der, x)
        arr = Math.min(arr, y); aba = Math.max(aba, y)
      }
    }
  }
  if (der < 0) return { avance, x: 0, y: 0, ancho: 0, alto: 0, bits: [] }
  const ancho = der - izq + 1
  const alto = aba - arr + 1
  const bits = []
  for (let y = arr; y <= aba; y++) for (let x = izq; x <= der; x++) bits.push(data[y * info.width + x] < 128 ? 1 : 0)
  return { avance, x: x0 + izq, y: y0 + arr, ancho, alto, bits }
}

/**
 * Por glifo: código (2 bytes), avance × 16 (2), desfase x e y con signo (1 y
 * 1), ancho y alto (1 y 1), y los bits de la tinta fila tras fila, sin
 * relleno entre filas y completando el último byte.
 */
function empacar(glifos) {
  const bytes = []
  for (const [caracter, g] of glifos) {
    const codigo = caracter.codePointAt(0)
    const avance = Math.round(g.avance * 16)
    bytes.push(codigo >> 8, codigo & 0xff, avance >> 8, avance & 0xff, g.x & 0xff, g.y & 0xff, g.ancho, g.alto)
    for (let i = 0; i < g.bits.length; i += 8) {
      let b = 0
      for (let k = 0; k < 8; k++) if (g.bits[i + k]) b |= 0x80 >> k
      bytes.push(b)
    }
  }
  return Buffer.from(bytes).toString('base64')
}

const bloques = []
let total = 0
for (const [peso, { archivo, tamaños, caracteres }] of Object.entries(PESOS)) {
  const b = readFileSync(join(FIGTREE, archivo))
  const fuente = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
  const escala = (t) => t / fuente.unitsPerEm
  const tallas = []
  for (const tamaño of tamaños) {
    const glifos = []
    for (const c of caracteres) glifos.push([c, await glifo(fuente, c, tamaño)])
    const datos = empacar(glifos)
    total += datos.length
    tallas.push(
      `    {\n      tamaño: ${tamaño},\n      mayuscula: ${Math.round(fuente.tables.os2.sCapHeight * escala(tamaño))},\n      descendente: ${Math.ceil(-fuente.charToGlyph('g').getBoundingBox().y1 * escala(tamaño))},\n      datos:\n        '${datos}',\n    }`,
    )
  }
  bloques.push(`  ${peso}: [\n${tallas.join(',\n')},\n  ]`)
}

writeFileSync(
  DESTINO,
  `/**
 * Figtree en 1 bit para la etiqueta de prendas: Bold a ${PESOS.bold.tamaños.join(', ')} puntos y
 * ExtraBold (solo cifras, para el precio) a ${PESOS.extrabold.tamaños.join(', ')}.
 *
 * GENERADO por \`scripts/letra-etiqueta.mjs\` desde \`@expo-google-fonts/figtree\`.
 * No se edita a mano: el formato de \`datos\` lo explica el script y lo lee \`letras.ts\`.
 */

export interface TallaCruda {
  tamaño: number
  /** Alto de la mayúscula en puntos. */
  mayuscula: number
  /** Lo que baja la «g» de la línea base, en puntos. */
  descendente: number
  datos: string
}

export const LETRAS: { bold: readonly TallaCruda[]; extrabold: readonly TallaCruda[] } = {
${bloques.join(',\n')},
}
`,
)

console.log(`Escrito ${DESTINO}: ${Math.round(total / 1024)} KB de glifos en base64`)
