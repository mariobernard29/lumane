/**
 * PNG de 1 bit sin dependencias, para enseñar en pantalla una imagen de
 * etiqueta (`RasterImage`) tal cual: React Native pinta un `data:image/png`
 * en Android y en web sin librerías de dibujo.
 *
 * Sin compresión (bloques «stored» de deflate): una etiqueta de 50 × 25 mm
 * son 10 KB y nunca sale de la tablet.
 */
import type { RasterImage } from './escpos.ts'
import { aBase64 } from './letras.ts'

const TABLA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = TABLA_CRC[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
}

function bloque(tipo: string, datos: Uint8Array): number[] {
  const cuerpo = new Uint8Array(4 + datos.length)
  for (let i = 0; i < 4; i++) cuerpo[i] = tipo.charCodeAt(i)
  cuerpo.set(datos, 4)
  return [...u32(datos.length), ...cuerpo, ...u32(crc32(cuerpo))]
}

/** `RasterImage` (1 = tinta) a PNG en escala de grises de 1 bit (1 = blanco). */
export function pngDeRaster(img: RasterImage): Uint8Array {
  const bytesPorFila = Math.ceil(img.width / 8)
  // Cada fila lleva delante su filtro (0 = ninguno).
  const crudo = new Uint8Array((bytesPorFila + 1) * img.height)
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < bytesPorFila; x++) {
      crudo[y * (bytesPorFila + 1) + 1 + x] = ~(img.data[y * bytesPorFila + x] ?? 0) & 0xff
    }
  }

  const zlib: number[] = [0x78, 0x01]
  for (let i = 0; i < crudo.length || i === 0; i += 0xffff) {
    const trozo = crudo.subarray(i, i + 0xffff)
    const ultimo = i + 0xffff >= crudo.length
    zlib.push(ultimo ? 1 : 0, trozo.length & 0xff, trozo.length >> 8, ~trozo.length & 0xff, (~trozo.length >> 8) & 0xff)
    for (const b of trozo) zlib.push(b)
    if (ultimo) break
  }
  let a = 1
  let b = 0
  for (const v of crudo) {
    a = (a + v) % 65521
    b = (b + a) % 65521
  }
  zlib.push(...u32(((b << 16) | a) >>> 0))

  const cabecera = new Uint8Array([...u32(img.width), ...u32(img.height), 1, 0, 0, 0, 0])
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...bloque('IHDR', cabecera),
    ...bloque('IDAT', Uint8Array.from(zlib)),
    ...bloque('IEND', new Uint8Array(0)),
  ])
}

export function pngDataUri(img: RasterImage): string {
  return `data:image/png;base64,${aBase64(pngDeRaster(img))}`
}
