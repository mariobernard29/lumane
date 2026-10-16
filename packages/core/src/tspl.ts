/**
 * Constructor de comandos TSPL.
 *
 * TSPL es el lenguaje de las etiquetadoras térmicas (TSC y sus clones; la
 * Hanna58 de SICAR lo emula). No se parece a ESC/POS: en vez de un flujo de
 * renglones que avanza el papel, cada etiqueta es un LIENZO de puntos donde
 * se colocan textos, imágenes y códigos de barras por coordenadas, y `PRINT`
 * la imprime entera y avanza hasta el hueco de la siguiente.
 *
 * Como `EscPosBuilder`, produce bytes y no sabe nada de Bluetooth.
 *
 * Referencia: TSPL/TSPL2 Programming Manual de TSC. Solo se usa lo que
 * cualquier clon implementa: las cinco fuentes de mapa de bits residentes,
 * `BITMAP`, `BARCODE`, `BAR` y `BOX`. Nada de fuentes TrueType ni de alineado
 * por parámetro de `TEXT`, que muchos clones ignoran: el centrado se calcula
 * aquí con el ancho conocido de cada fuente.
 */
import { encodeText, type RasterImage } from './escpos.ts'

/** Puntos por milímetro a 203 dpi, la resolución de casi toda etiquetadora de 58 mm. */
export const PUNTOS_POR_MM = 8

/** Fuentes residentes de TSPL: ancho y alto de cada carácter en puntos (a 203 dpi). */
export const FUENTES_TSPL = {
  '1': { ancho: 8, alto: 12 },
  '2': { ancho: 12, alto: 20 },
  '3': { ancho: 16, alto: 24 },
  '4': { ancho: 24, alto: 32 },
  '5': { ancho: 32, alto: 48 },
} as const

export type FuenteTspl = keyof typeof FUENTES_TSPL

/** Lo que mide un texto en puntos con una fuente y su multiplicador. */
export function medirTexto(texto: string, fuente: FuenteTspl, escala = 1): { ancho: number; alto: number } {
  const f = FUENTES_TSPL[fuente]
  return { ancho: [...texto].length * f.ancho * escala, alto: f.alto * escala }
}

export interface ConfigEtiquetadora {
  anchoMm: number
  altoMm: number
  /** Hueco entre etiquetas. 0 = papel continuo. */
  separacionMm: number
  /** Oscuridad, 0–15. Más alto = más negro y más lento de enfriar. */
  densidad?: number
  /** Pulgadas por segundo. 2–4 es lo seguro en las de 58 mm. */
  velocidad?: number
  /** `true` gira la impresión 180°: según cómo salga el rollo, la etiqueta queda al derecho. */
  girar?: boolean
  /** Corrección fina para centrar en la etiqueta física, en mm. */
  desplazarXmm?: number
  desplazarYmm?: number
}

const CRLF = [0x0d, 0x0a]

/** Comillas dentro de una cadena TSPL: `\["]` según el manual. */
function cadena(texto: string): string {
  return `"${texto.replace(/"/g, '\\["]')}"`
}

export class TsplBuilder {
  private readonly bytes: number[] = []
  // Campos asignados a mano, no parámetros-propiedad: esa azúcar no sobrevive
  // al borrado de tipos de `node --experimental-strip-types` (ver escpos.ts).
  readonly config: ConfigEtiquetadora
  readonly anchoPuntos: number
  readonly altoPuntos: number

  constructor(config: ConfigEtiquetadora) {
    this.config = config
    this.anchoPuntos = Math.round(config.anchoMm * PUNTOS_POR_MM)
    this.altoPuntos = Math.round(config.altoMm * PUNTOS_POR_MM)
  }

  private comando(texto: string): this {
    this.bytes.push(...encodeText(texto), ...CRLF)
    return this
  }

  /**
   * La cabecera del trabajo: medida, hueco, oscuridad, orientación y la
   * página de códigos 850 para que salgan los acentos (mismos bytes que el
   * ticket ESC/POS).
   */
  configurar(): this {
    const c = this.config
    const x = Math.round((c.desplazarXmm ?? 0) * PUNTOS_POR_MM)
    const y = Math.round((c.desplazarYmm ?? 0) * PUNTOS_POR_MM)
    return this.comando(`SIZE ${num(c.anchoMm)} mm,${num(c.altoMm)} mm`)
      .comando(`GAP ${num(c.separacionMm)} mm,0 mm`)
      .comando(`DIRECTION ${c.girar ? 0 : 1},0`)
      .comando(`REFERENCE ${Math.max(0, x)},${Math.max(0, y)}`)
      .comando(`SHIFT ${Math.min(0, y)}`)
      .comando(`DENSITY ${Math.round(limitar(c.densidad ?? 8, 0, 15))}`)
      .comando(`SPEED ${Math.round(limitar(c.velocidad ?? 3, 1, 6))}`)
      .comando('SET TEAR ON')
      .comando('CODEPAGE 850')
  }

  /** Limpia el lienzo: va antes de dibujar cada etiqueta distinta. */
  limpiar(): this {
    return this.comando('CLS')
  }

  texto(x: number, y: number, contenido: string, fuente: FuenteTspl, escala = 1): this {
    const e = Math.round(limitar(escala, 1, 10))
    return this.comando(`TEXT ${Math.round(x)},${Math.round(y)},"${fuente}",0,${e},${e},${cadena(contenido)}`)
  }

  /**
   * Código de barras nativo de la impresora, sin texto legible (lo pone la
   * plantilla, con la fuente y el sitio que convienen).
   */
  codigoBarras(x: number, y: number, tipo: TipoCodigo, alto: number, modulo: number, contenido: string): this {
    const n = Math.round(limitar(modulo, 1, 10))
    return this.comando(
      `BARCODE ${Math.round(x)},${Math.round(y)},"${tipo}",${Math.round(alto)},0,0,${n},${n},${cadena(contenido)}`,
    )
  }

  /**
   * BITMAP x,y,anchoBytes,alto,0,<datos>. En TSPL el bit a 0 es el que se
   * imprime —al revés que en ESC/POS—, así que se invierte la imagen.
   */
  imagen(x: number, y: number, img: RasterImage): this {
    const bytesPorFila = Math.ceil(img.width / 8)
    this.bytes.push(...encodeText(`BITMAP ${Math.round(x)},${Math.round(y)},${bytesPorFila},${img.height},0,`))
    for (let i = 0; i < bytesPorFila * img.height; i++) this.bytes.push(~(img.data[i] ?? 0) & 0xff)
    this.bytes.push(...CRLF)
    return this
  }

  /** Una línea o un rectángulo relleno. */
  barra(x: number, y: number, ancho: number, alto: number): this {
    return this.comando(`BAR ${Math.round(x)},${Math.round(y)},${Math.round(ancho)},${Math.round(alto)}`)
  }

  /** Un recuadro de contorno: la página de prueba lo usa para ver los bordes. */
  caja(x: number, y: number, x2: number, y2: number, grosor: number): this {
    return this.comando(`BOX ${Math.round(x)},${Math.round(y)},${Math.round(x2)},${Math.round(y2)},${grosor}`)
  }

  /** Imprime el lienzo `copias` veces. */
  imprimir(copias = 1): this {
    return this.comando(`PRINT 1,${Math.max(1, Math.round(copias))}`)
  }

  build(): Uint8Array {
    return Uint8Array.from(this.bytes)
  }
}

export type TipoCodigo = '128' | 'EAN13' | 'UPCA'

/**
 * El tipo de código que corresponde a un valor: los EAN-13 y UPC-A de
 * proveedor se imprimen como tales (con su dígito verificador correcto); todo
 * lo demás, incluidos los SKU de Lumane, en Code 128.
 */
export function tipoDeCodigo(valor: string): TipoCodigo {
  if (/^\d{13}$/.test(valor) && digitoEan(valor.slice(0, 12)) === Number(valor[12])) return 'EAN13'
  if (/^\d{12}$/.test(valor) && digitoEan(`0${valor.slice(0, 11)}`) === Number(valor[11])) return 'UPCA'
  return '128'
}

function digitoEan(doce: string): number {
  let suma = 0
  for (let i = 0; i < 12; i++) suma += Number(doce[i]) * (i % 2 === 0 ? 1 : 3)
  return (10 - (suma % 10)) % 10
}

/**
 * Ancho de un código en MÓDULOS (barras de un punto con módulo 1), para
 * centrarlo y elegir el grosor que cabe.
 *
 * Para Code 128 se imita el cambio automático que hace la impresora con
 * `"128"`: juego C (dos dígitos por símbolo) para una racha inicial de cuatro
 * dígitos o más, juego B para el resto. No hace falta exactitud al módulo:
 * un error de un símbolo descentra un milímetro, no rompe la lectura.
 */
export function modulosDeCodigo(valor: string, tipo: TipoCodigo): number {
  if (tipo === 'EAN13' || tipo === 'UPCA') return 95
  // Arranque (11) + verificador (11) + parada (13).
  const fijo = 35
  if (/^\d+$/.test(valor) && valor.length >= 4) {
    return fijo + Math.floor(valor.length / 2) * 11 + (valor.length % 2 ? 22 : 0)
  }
  const racha = /^\d+/.exec(valor)?.[0].length ?? 0
  if (racha >= 4) {
    const pares = racha - (racha % 2)
    return fijo + (pares / 2) * 11 + 11 + (valor.length - pares) * 11
  }
  return fijo + [...valor].length * 11
}

function limitar(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** `50` → `50`, `50.8` → `50.8`: TSPL acepta decimales en mm. */
function num(n: number): string {
  return String(Math.round(n * 10) / 10)
}

// ---------------------------------------------------------------------------
// Lectura: de bytes a elementos
// ---------------------------------------------------------------------------

export type ElementoEtiqueta =
  | { tipo: 'texto'; x: number; y: number; ancho: number; alto: number; fuente: FuenteTspl; escala: number; contenido: string }
  | { tipo: 'imagen'; x: number; y: number; ancho: number; alto: number; imagen: RasterImage }
  | { tipo: 'codigo'; x: number; y: number; ancho: number; alto: number; simbologia: TipoCodigo; modulo: number; contenido: string }
  | { tipo: 'barra'; x: number; y: number; ancho: number; alto: number }
  | { tipo: 'caja'; x: number; y: number; ancho: number; alto: number }

export interface EtiquetaLeída {
  anchoPuntos: number
  altoPuntos: number
  separacionMm: number
  /** Una entrada por `PRINT`: lo que había en el lienzo y cuántas copias. */
  etiquetas: { copias: number; elementos: ElementoEtiqueta[] }[]
}

const DESDE_CP850_TSPL = new Map<number, string>([
  [0xa0, 'á'], [0x82, 'é'], [0xa1, 'í'], [0xa2, 'ó'], [0xa3, 'ú'],
  [0xb5, 'Á'], [0x90, 'É'], [0xd6, 'Í'], [0xe0, 'Ó'], [0xe9, 'Ú'],
  [0xa4, 'ñ'], [0xa5, 'Ñ'], [0x81, 'ü'], [0x9a, 'Ü'],
])

/**
 * Bytes TSPL a elementos con su caja en puntos. Entiende exactamente lo que
 * emite `TsplBuilder`: es para probar plantillas y pintar la vista previa, no
 * un intérprete completo.
 */
export function leerEtiqueta(bytes: Uint8Array): EtiquetaLeída {
  const salida: EtiquetaLeída = { anchoPuntos: 0, altoPuntos: 0, separacionMm: 0, etiquetas: [] }
  let lienzo: ElementoEtiqueta[] = []
  let i = 0

  const linea = (): string => {
    let s = ''
    while (i < bytes.length && bytes[i] !== 0x0a) {
      const b = bytes[i++]!
      if (b !== 0x0d) s += DESDE_CP850_TSPL.get(b) ?? String.fromCharCode(b)
    }
    i++
    return s
  }
  /** Argumentos separados por comas, respetando las cadenas entre comillas. */
  const args = (resto: string): string[] => {
    const partes: string[] = []
    let actual = ''
    let enCadena = false
    for (let k = 0; k < resto.length; k++) {
      const c = resto[k]!
      if (c === '\\' && resto.slice(k, k + 4) === '\\["]') {
        actual += '"'
        k += 3
      } else if (c === '"') {
        enCadena = !enCadena
      } else if (c === ',' && !enCadena) {
        partes.push(actual.trim())
        actual = ''
      } else {
        actual += c
      }
    }
    partes.push(actual.trim())
    return partes
  }
  const mm = (s: string) => Number.parseFloat(s)

  while (i < bytes.length) {
    // BITMAP lleva datos binarios después de su cabecera: se lee aparte.
    if (String.fromCharCode(...bytes.subarray(i, i + 7)) === 'BITMAP ') {
      let cab = ''
      let comas = 0
      while (comas < 5) {
        const c = String.fromCharCode(bytes[i++]!)
        if (c === ',') comas++
        cab += c
      }
      const [x, y, anchoBytes, alto] = cab.slice(7).split(',').map(Number) as [number, number, number, number]
      const n = anchoBytes * alto
      const data = new Uint8Array(n)
      for (let k = 0; k < n; k++) data[k] = ~bytes[i + k]! & 0xff
      i += n + 2
      lienzo.push({ tipo: 'imagen', x, y, ancho: anchoBytes * 8, alto, imagen: { width: anchoBytes * 8, height: alto, data } })
      continue
    }

    const l = linea()
    const espacio = l.indexOf(' ')
    const cmd = espacio < 0 ? l : l.slice(0, espacio)
    const a = espacio < 0 ? [] : args(l.slice(espacio + 1))

    if (cmd === 'SIZE') {
      salida.anchoPuntos = Math.round(mm(a[0]!) * PUNTOS_POR_MM)
      salida.altoPuntos = Math.round(mm(a[1]!) * PUNTOS_POR_MM)
    } else if (cmd === 'GAP') {
      salida.separacionMm = mm(a[0]!)
    } else if (cmd === 'CLS') {
      lienzo = []
    } else if (cmd === 'TEXT') {
      const fuente = a[2] as FuenteTspl
      const escala = Number(a[4])
      const contenido = a[6] ?? ''
      const m = medirTexto(contenido, fuente, escala)
      lienzo.push({ tipo: 'texto', x: Number(a[0]), y: Number(a[1]), ancho: m.ancho, alto: m.alto, fuente, escala, contenido })
    } else if (cmd === 'BARCODE') {
      const simbologia = a[2] as TipoCodigo
      const modulo = Number(a[6])
      const contenido = a[8] ?? ''
      lienzo.push({
        tipo: 'codigo',
        x: Number(a[0]),
        y: Number(a[1]),
        ancho: modulosDeCodigo(contenido, simbologia) * modulo,
        alto: Number(a[3]),
        simbologia,
        modulo,
        contenido,
      })
    } else if (cmd === 'BAR') {
      lienzo.push({ tipo: 'barra', x: Number(a[0]), y: Number(a[1]), ancho: Number(a[2]), alto: Number(a[3]) })
    } else if (cmd === 'BOX') {
      const [x, y, x2, y2] = a.map(Number) as [number, number, number, number]
      lienzo.push({ tipo: 'caja', x, y, ancho: x2 - x, alto: y2 - y })
    } else if (cmd === 'PRINT') {
      salida.etiquetas.push({ copias: Number(a[1] ?? 1), elementos: lienzo })
    }
  }
  return salida
}

/**
 * Los elementos de una etiqueta leída pintados en una imagen del tamaño de
 * la etiqueta: la vista previa de la pantalla. Las imágenes sobrescriben lo
 * que tapan, como `BITMAP` en modo 0. Los `TEXT` y `BARCODE` no se pintan: la
 * plantilla de prendas ya no los usa.
 */
export function rasterizarEtiqueta(anchoPuntos: number, altoPuntos: number, elementos: ElementoEtiqueta[]): RasterImage {
  const bytesPorFila = Math.ceil(anchoPuntos / 8)
  const data = new Uint8Array(bytesPorFila * altoPuntos)
  const punto = (x: number, y: number, tinta: boolean) => {
    if (x < 0 || y < 0 || x >= anchoPuntos || y >= altoPuntos) return
    const i = y * bytesPorFila + (x >> 3)
    const bit = 0x80 >> (x & 7)
    data[i] = tinta ? data[i]! | bit : data[i]! & ~bit
  }
  const rect = (x: number, y: number, w: number, h: number) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) punto(xx, yy, true)
  }
  for (const e of elementos) {
    if (e.tipo === 'imagen') {
      const bpf = Math.ceil(e.imagen.width / 8)
      for (let yy = 0; yy < e.imagen.height; yy++) {
        for (let xx = 0; xx < e.imagen.width; xx++) {
          const b = e.imagen.data[yy * bpf + (xx >> 3)] ?? 0
          punto(e.x + xx, e.y + yy, (b & (0x80 >> (xx & 7))) !== 0)
        }
      }
    } else if (e.tipo === 'barra') {
      rect(e.x, e.y, e.ancho, e.alto)
    } else if (e.tipo === 'caja') {
      rect(e.x, e.y, e.ancho, 2)
      rect(e.x, e.y + e.alto - 2, e.ancho, 2)
      rect(e.x, e.y, 2, e.alto)
      rect(e.x + e.ancho - 2, e.y, 2, e.alto)
    }
  }
  return { width: bytesPorFila * 8, height: altoPuntos, data }
}
