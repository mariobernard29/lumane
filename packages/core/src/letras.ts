/**
 * Textos de la etiqueta convertidos en imágenes de 1 bit.
 *
 * Las etiquetadoras baratas no respetan las fuentes residentes de TSPL (la
 * Hanna58 imprime igual la «2», la «3» y la «4»), pero un `BITMAP` sale
 * exacto. Así que la tablet compone cada texto con las letras de
 * `letra-etiqueta.ts` —Figtree, la de la marca— y lo manda como imagen: el
 * tamaño es el que se pidió y la vista previa es idéntica al papel.
 */
import type { RasterImage } from './escpos.ts'
import { LETRAS, type TallaCruda } from './letra-etiqueta.ts'

export type Peso = keyof typeof LETRAS

interface Glifo {
  avance: number
  /** Desfase de la tinta respecto al origen (x) y a la línea base (y, negativo hacia arriba). */
  x: number
  y: number
  ancho: number
  alto: number
  /** Un byte por punto, 1 = tinta. */
  bits: Uint8Array
}

export interface Letra {
  peso: Peso
  tamaño: number
  /** Alto de la mayúscula, en puntos. */
  mayuscula: number
  /** Lo que baja la «g», en puntos. */
  descendente: number
  glifos: Map<number, Glifo>
}

const decodificadas = new Map<string, Letra>()

export function tamañosDe(peso: Peso): number[] {
  return LETRAS[peso].map((t) => t.tamaño)
}

/** La letra de ese peso más grande que no pasa de `tamaño` (la más chica si todas pasan). */
export function letra(peso: Peso, tamaño: number): Letra {
  const tallas = LETRAS[peso]
  let elegida = tallas[0]!
  for (const t of tallas) if (t.tamaño <= tamaño) elegida = t
  const clave = `${peso}-${elegida.tamaño}`
  let l = decodificadas.get(clave)
  if (!l) {
    l = decodificar(peso, elegida)
    decodificadas.set(clave, l)
  }
  return l
}

/** El formato lo describe `scripts/letra-etiqueta.mjs`. */
function decodificar(peso: Peso, t: TallaCruda): Letra {
  const b = deBase64(t.datos)
  const glifos = new Map<number, Glifo>()
  let i = 0
  while (i + 8 <= b.length) {
    const codigo = (b[i]! << 8) | b[i + 1]!
    const avance = ((b[i + 2]! << 8) | b[i + 3]!) / 16
    const x = (b[i + 4]! << 24) >> 24
    const y = (b[i + 5]! << 24) >> 24
    const ancho = b[i + 6]!
    const alto = b[i + 7]!
    i += 8
    const n = ancho * alto
    const bits = new Uint8Array(n)
    for (let k = 0; k < n; k++) bits[k] = (b[i + (k >> 3)]! >> (7 - (k & 7))) & 1
    i += Math.ceil(n / 8)
    glifos.set(codigo, { avance, x, y, ancho, alto, bits })
  }
  return { peso, tamaño: t.tamaño, mayuscula: t.mayuscula, descendente: t.descendente, glifos }
}

const VACIO: Glifo = { avance: 0, x: 0, y: 0, ancho: 0, alto: 0, bits: new Uint8Array(0) }

/** El glifo de un carácter; sin él, el mismo sin acento, y si no, «?». */
function glifoDe(l: Letra, c: string): Glifo {
  const directo = l.glifos.get(c.codePointAt(0)!)
  if (directo) return directo
  let base = ''
  try {
    base = c.normalize('NFD').replace(/[̀-ͯ]/g, '')
  } catch {
    // Un Hermes sin Intl no trae `normalize`: se queda el «?».
  }
  const sinAcento = base ? l.glifos.get(base.codePointAt(0)!) : undefined
  return sinAcento ?? l.glifos.get(0x3f) ?? { ...VACIO, avance: l.tamaño / 2 }
}

interface Trazo {
  glifo: Glifo
  /** Origen del glifo, ya redondeado. */
  x: number
}

function trazar(texto: string, l: Letra): { trazos: Trazo[]; izquierda: number; derecha: number } {
  const trazos: Trazo[] = []
  let pluma = 0
  let izquierda = Infinity
  let derecha = -Infinity
  for (const c of texto) {
    const g = glifoDe(l, c)
    const x = Math.round(pluma)
    trazos.push({ glifo: g, x })
    if (g.ancho > 0) {
      izquierda = Math.min(izquierda, x + g.x)
      derecha = Math.max(derecha, x + g.x + g.ancho)
    }
    pluma += g.avance
  }
  if (izquierda > derecha) return { trazos, izquierda: 0, derecha: 0 }
  return { trazos, izquierda, derecha }
}

/** Ancho de la tinta de un renglón, en puntos. */
export function anchoTexto(texto: string, l: Letra): number {
  const { izquierda, derecha } = trazar(texto, l)
  return derecha - izquierda
}

export interface TextoEnBits {
  /** Ancho redondeado a byte, con la tinta pegada a la izquierda. */
  imagen: RasterImage
  /** Ancho de la tinta, sin el relleno hasta el byte. */
  ancho: number
  /** De la orilla de arriba de la imagen a la línea base del PRIMER renglón. */
  base: number
}

/**
 * Uno o varios renglones en una sola imagen recortada a la tinta. Los
 * renglones van a `interlineado` puntos de línea base a línea base y se
 * alinean entre ellos (a la izquierda, al centro o a la derecha del más largo).
 */
export function textoEnBits(
  renglones: string[],
  l: Letra,
  opciones: { alinear?: 'left' | 'center' | 'right'; interlineado?: number } = {},
): TextoEnBits {
  const alinear = opciones.alinear ?? 'left'
  const interlineado = opciones.interlineado ?? Math.round(l.tamaño * 1.15)
  const trazados = renglones.map((r) => trazar(r, l))
  const ancho = Math.max(0, ...trazados.map((t) => t.derecha - t.izquierda))

  // Desfase horizontal de cada renglón para que su tinta quede alineada.
  const dx = trazados.map((t) => {
    const w = t.derecha - t.izquierda
    const holgura = alinear === 'center' ? Math.floor((ancho - w) / 2) : alinear === 'right' ? ancho - w : 0
    return holgura - t.izquierda
  })

  let arriba = Infinity
  let abajo = -Infinity
  trazados.forEach((t, i) => {
    for (const { glifo } of t.trazos) {
      if (glifo.ancho === 0) continue
      arriba = Math.min(arriba, i * interlineado + glifo.y)
      abajo = Math.max(abajo, i * interlineado + glifo.y + glifo.alto)
    }
  })
  if (arriba > abajo) {
    arriba = -l.mayuscula
    abajo = 0
  }

  const anchoImagen = Math.max(8, Math.ceil(ancho / 8) * 8)
  const bytesPorFila = anchoImagen / 8
  const alto = abajo - arriba
  const data = new Uint8Array(bytesPorFila * alto)
  trazados.forEach((t, i) => {
    for (const { glifo: g, x } of t.trazos) {
      const x0 = x + g.x + dx[i]!
      const y0 = i * interlineado + g.y - arriba
      for (let yy = 0; yy < g.alto; yy++) {
        for (let xx = 0; xx < g.ancho; xx++) {
          if (!g.bits[yy * g.ancho + xx]) continue
          const px = x0 + xx
          const py = y0 + yy
          if (px < 0 || px >= anchoImagen || py < 0 || py >= alto) continue
          data[py * bytesPorFila + (px >> 3)]! |= 0x80 >> (px & 7)
        }
      }
    }
  })
  return { imagen: { width: anchoImagen, height: alto, data }, ancho, base: -arriba }
}

/**
 * Parte un texto por palabras en renglones que caben en `ancho` puntos. Si
 * sobran renglones, el último se recorta con «…». Una palabra más larga que
 * el ancho se corta a la fuerza.
 */
export function partirEnRenglones(
  texto: string,
  l: Letra,
  ancho: number,
  maximo: number,
): { renglones: string[]; completo: boolean } {
  const palabras = texto.trim().split(/\s+/).filter(Boolean)
  const salida: string[] = []
  let actual = ''
  for (const p of palabras) {
    const candidato = actual ? `${actual} ${p}` : p
    if (anchoTexto(candidato, l) <= ancho) {
      actual = candidato
      continue
    }
    if (actual) salida.push(actual)
    actual = anchoTexto(p, l) <= ancho ? p : recortar(p, l, ancho, '')
  }
  if (actual) salida.push(actual)
  if (salida.length <= maximo) return { renglones: salida, completo: true }
  const renglones = salida.slice(0, maximo)
  renglones[maximo - 1] = recortar(`${renglones[maximo - 1]!}…`, l, ancho, '…')
  return { renglones, completo: false }
}

/** Quita caracteres del final hasta que `texto` (con `sufijo`) cabe en `ancho`. */
export function recortar(texto: string, l: Letra, ancho: number, sufijo = '…'): string {
  if (anchoTexto(texto, l) <= ancho) return texto
  const base = sufijo && texto.endsWith(sufijo) ? texto.slice(0, -sufijo.length) : texto
  const letras = [...base]
  while (letras.length > 1) {
    letras.pop()
    const candidato = letras.join('').trimEnd() + sufijo
    if (anchoTexto(candidato, l) <= ancho) return candidato
  }
  return letras.join('')
}

// ---------------------------------------------------------------------------
// Base64, a mano: Hermes no siempre trae `atob`.
// ---------------------------------------------------------------------------

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const VALOR = new Map([...ALFABETO].map((c, i) => [c, i]))

export function deBase64(texto: string): Uint8Array {
  const limpio = texto.replace(/=+$/, '')
  const salida = new Uint8Array(Math.floor((limpio.length * 3) / 4))
  let o = 0
  for (let i = 0; i < limpio.length; i += 4) {
    const n =
      ((VALOR.get(limpio[i]!) ?? 0) << 18) |
      ((VALOR.get(limpio[i + 1] ?? 'A') ?? 0) << 12) |
      ((VALOR.get(limpio[i + 2] ?? 'A') ?? 0) << 6) |
      (VALOR.get(limpio[i + 3] ?? 'A') ?? 0)
    if (o < salida.length) salida[o++] = (n >> 16) & 0xff
    if (o < salida.length) salida[o++] = (n >> 8) & 0xff
    if (o < salida.length) salida[o++] = n & 0xff
  }
  return salida
}

export function aBase64(bytes: Uint8Array): string {
  let salida = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!
    salida += ALFABETO[n >> 18]! + ALFABETO[(n >> 12) & 63]! + ALFABETO[(n >> 6) & 63]! + ALFABETO[n & 63]!
  }
  const resto = bytes.length - i
  if (resto === 1) {
    const n = bytes[i]! << 16
    salida += ALFABETO[n >> 18]! + ALFABETO[(n >> 12) & 63]! + '=='
  } else if (resto === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8)
    salida += ALFABETO[n >> 18]! + ALFABETO[(n >> 12) & 63]! + ALFABETO[(n >> 6) & 63]! + '='
  }
  return salida
}
