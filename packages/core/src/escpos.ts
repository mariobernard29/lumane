/**
 * Constructor de comandos ESC/POS.
 *
 * Produce los BYTES que se mandan a la impresora térmica. No sabe nada de
 * Bluetooth: quien los transporte es cosa de `apps/pos`. Esa separación es
 * deliberada —es el riesgo número 4 del plan— porque los modelos de impresora
 * son heterogéneos y lo único que se puede probar sin tener una delante es
 * exactamente esto: que los bytes sean los correctos.
 *
 * Referencia: comandos estándar de Epson, que casi toda impresora térmica de
 * 58/80 mm implementa aunque la marca sea otra.
 */

const ESC = 0x1b
const GS = 0x1d

export type Align = 'left' | 'center' | 'right'

/** 58 mm imprime 32 caracteres por línea; 80 mm, 48. (En la fuente A.) */
export type PaperWidth = 32 | 48

/**
 * Las dos fuentes residentes de casi toda térmica ESC/POS.
 *
 * A (12×24 puntos) es la del cuerpo del ticket: se lee bien a la distancia del
 * mostrador. B (9×17) mete un tercio más de caracteres por línea y sirve para
 * la letra pequeña —redes, IVA, pie— sin gastar papel en lo que nadie lee dos
 * veces.
 */
export type Font = 'A' | 'B'

/** Caracteres por línea de la fuente B para cada ancho de papel. */
const COLUMNAS_B: Record<PaperWidth, number> = { 32: 42, 48: 64 }

/**
 * Imagen de 1 bit lista para `GS v 0`: filas de `width / 8` bytes, el bit más
 * alto a la izquierda, 1 = punto negro.
 */
export interface RasterImage {
  width: number
  height: number
  data: Uint8Array
}

/**
 * Cómo termina el ticket. `'auto'` manda la orden de corte a la cuchilla;
 * `'manual'` solo avanza el papel hasta la barra dentada. Las impresoras sin
 * cuchilla (la Moon58W de la boutique es una) no siempre ignoran `GS V`:
 * algunas lo imprimen como basura.
 */
export type Corte = 'auto' | 'manual'

export interface EscPosOptions {
  corte?: Corte
}

/**
 * Tabla de códigos 850 (Multilingual Latin 1).
 *
 * Los tickets van en español y una impresora térmica no habla UTF-8: manda un
 * byte por carácter según la página de códigos que tenga cargada. Sin esto,
 * "Suéters" sale como "SuÃ©ters" y los acentos se convierten en ruido.
 *
 * Solo se mapea lo que el español necesita. Cualquier otra cosa cae al
 * equivalente sin acento —y si tampoco lo hay, a `?`—, que es feo pero legible;
 * mandar el byte crudo imprimiría un símbolo al azar.
 */
const CP850: Record<string, number> = {
  á: 0xa0, é: 0x82, í: 0xa1, ó: 0xa2, ú: 0xa3,
  Á: 0xb5, É: 0x90, Í: 0xd6, Ó: 0xe0, Ú: 0xe9,
  ñ: 0xa4, Ñ: 0xa5, ü: 0x81, Ü: 0x9a,
  '¿': 0xa8, '¡': 0xad, '°': 0xf8, '·': 0xfa,
  '«': 0xae, '»': 0xaf, '€': 0xd5,
}

/** Último recurso cuando la página de códigos no tiene el carácter. */
const SIN_ACENTO: Record<string, string> = {
  à: 'a', â: 'a', ä: 'a', è: 'e', ê: 'e', ë: 'e',
  ì: 'i', î: 'i', ï: 'i', ò: 'o', ô: 'o', ö: 'o',
  ù: 'u', û: 'u', ç: 'c', '–': '-', '—': '-',
  '“': '"', '”': '"', '‘': "'", '’': "'", '…': '...',
}

function encodeText(text: string): number[] {
  const bytes: number[] = []

  for (const char of text) {
    const mapped = CP850[char]
    if (mapped !== undefined) {
      bytes.push(mapped)
      continue
    }

    const code = char.codePointAt(0)!
    if (code < 0x80) {
      bytes.push(code)
      continue
    }

    const plain = SIN_ACENTO[char]
    if (plain) {
      for (const c of plain) bytes.push(c.codePointAt(0)!)
      continue
    }

    bytes.push(0x3f) // '?'
  }

  return bytes
}

const ALIGN: Record<Align, number> = { left: 0, center: 1, right: 2 }

/**
 * Acumula comandos y devuelve el búfer al final.
 *
 * Encadenable a propósito: una plantilla de ticket se lee de arriba abajo
 * igual que sale del rollo.
 */
export class EscPosBuilder {
  private readonly bytes: number[] = []
  // Campos declarados y asignados a mano, no parámetros-propiedad: esa azúcar
  // de TypeScript no sobrevive al borrado de tipos sin transpilar, y este
  // paquete se ejecuta tal cual con `node --experimental-strip-types`.
  readonly paperWidth: PaperWidth
  readonly corte: Corte
  private fuente: Font = 'A'

  constructor(width: PaperWidth = 32, options: EscPosOptions = {}) {
    this.paperWidth = width
    this.corte = options.corte ?? 'auto'
  }

  /**
   * Caracteres por línea con la fuente activa. Es un getter, no un número
   * fijo, para que `rule`, `columns` y `wrap` llenen la línea igual en letra
   * pequeña que en normal.
   */
  get width(): number {
    return this.fuente === 'B' ? COLUMNAS_B[this.paperWidth] : this.paperWidth
  }

  private push(...values: number[]): this {
    this.bytes.push(...values)
    return this
  }

  /** ESC @ — reinicia la impresora y ESC t 2 — carga la página de códigos 850. */
  init(): this {
    this.fuente = 'A'
    return this.push(ESC, 0x40).push(ESC, 0x74, 2)
  }

  /** ESC M n — cambia entre la fuente A (normal) y la B (pequeña). */
  font(value: Font): this {
    this.fuente = value
    return this.push(ESC, 0x4d, value === 'B' ? 1 : 0)
  }

  align(value: Align): this {
    return this.push(ESC, 0x61, ALIGN[value])
  }

  bold(on: boolean): this {
    return this.push(ESC, 0x45, on ? 1 : 0)
  }

  /**
   * GS ! — 1 es el tamaño normal; 2 dobla ancho y alto; `'alto'` dobla solo
   * el alto.
   *
   * `'alto'` es el que conviene en 58 mm: destaca igual a la vista y conserva
   * las 32 columnas, así que un total de cinco cifras no se queda sin sitio
   * junto a su etiqueta.
   */
  size(scale: 1 | 2 | 'alto'): this {
    const n = scale === 2 ? 0x11 : scale === 'alto' ? 0x01 : 0x00
    return this.push(GS, 0x21, n)
  }

  /**
   * GS v 0 — imprime una imagen de 1 bit.
   *
   * Se manda en franjas de 128 filas: varias impresoras baratas tienen un
   * búfer de línea corto y con una imagen alta de un solo golpe imprimen
   * media y se cuelgan.
   */
  image(img: RasterImage): this {
    const bytesPorFila = Math.ceil(img.width / 8)
    for (let y = 0; y < img.height; y += 128) {
      const filas = Math.min(128, img.height - y)
      this.push(GS, 0x76, 0x30, 0, bytesPorFila & 0xff, bytesPorFila >> 8, filas & 0xff, filas >> 8)
      const inicio = y * bytesPorFila
      for (let i = inicio; i < inicio + filas * bytesPorFila; i++) this.bytes.push(img.data[i] ?? 0)
    }
    return this
  }

  text(value: string): this {
    return this.push(...encodeText(value))
  }

  line(value = ''): this {
    return this.text(value).push(0x0a)
  }

  /** Una regla de guiones del ancho del papel. */
  rule(char = '-'): this {
    return this.line(char.repeat(this.width))
  }

  /**
   * Dos columnas: etiqueta a la izquierda, importe a la derecha, separadas por
   * los espacios que hagan falta. Si no caben, manda la derecha —el importe— y
   * recorta la etiqueta: en un ticket, el número es lo que no se puede perder.
   *
   * `width` se pasa a mano cuando la línea va en doble tamaño: ahí caben la
   * mitad de caracteres y calcular el relleno sobre el ancho normal sacaría el
   * importe fuera del papel.
   */
  columns(left: string, right: string, width: number = this.width): this {
    const espacio = width - right.length
    const etiqueta = left.length > espacio ? left.slice(0, Math.max(0, espacio - 1)) : left
    const relleno = Math.max(1, width - etiqueta.length - right.length)
    return this.line(etiqueta + ' '.repeat(relleno) + right)
  }

  /**
   * Texto largo partido por palabras, sin cortar ninguna a la mitad.
   * Una palabra más larga que el papel sí se parte: no hay alternativa.
   */
  wrap(value: string): this {
    for (const línea of wrapText(value, this.width)) this.line(línea)
    return this
  }

  feed(lines = 1): this {
    return this.push(ESC, 0x64, lines)
  }

  /**
   * GS V 66 — corte parcial tras avanzar el papel.
   *
   * El avance previo no es decorativo: el cabezal y la cuchilla están
   * separados unos milímetros, y sin él la cuchilla cortaría por encima de las
   * últimas líneas impresas.
   */
  cut(): this {
    // Con corte manual el avance es mayor: la barra dentada está más lejos del
    // cabezal que una cuchilla, y lo último impreso tiene que quedar por
    // encima de ella para no arrancarlo con el papel.
    if (this.corte === 'manual') return this.feed(4)
    return this.feed(3).push(GS, 0x56, 66, 0)
  }

  /** ESC p — abre el cajón portamonedas, si hay uno conectado. */
  openDrawer(): this {
    return this.push(ESC, 0x70, 0, 25, 250)
  }

  build(): Uint8Array {
    return Uint8Array.from(this.bytes)
  }
}

export function wrapText(value: string, width: number): string[] {
  const palabras = value.split(/\s+/).filter(Boolean)
  const líneas: string[] = []
  let actual = ''

  for (const palabra of palabras) {
    if (palabra.length > width) {
      if (actual) {
        líneas.push(actual)
        actual = ''
      }
      for (let i = 0; i < palabra.length; i += width) {
        líneas.push(palabra.slice(i, i + width))
      }
      continue
    }

    if (actual === '') {
      actual = palabra
    } else if (actual.length + 1 + palabra.length <= width) {
      actual += ` ${palabra}`
    } else {
      líneas.push(actual)
      actual = palabra
    }
  }

  if (actual) líneas.push(actual)
  return líneas.length > 0 ? líneas : ['']
}
