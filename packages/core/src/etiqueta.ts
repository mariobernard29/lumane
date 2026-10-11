/**
 * La etiqueta de las prendas: monograma de Lumane, nombre, talla y color,
 * precio, código de barras y SKU.
 *
 * El diseño se calcula para la medida de la etiqueta en vez de fijarse para
 * una sola: los rollos cambian de proveedor y de tamaño, y una plantilla
 * pensada para 50 × 30 mm sale cortada en 40 × 25. Hay dos composiciones:
 *
 *  - **Apaisada** (más ancha que alta, la mayoría): monograma y nombre arriba,
 *    talla y precio en medio, código de barras abajo.
 *  - **Colgante** (más alta que ancha, 40 × 60): todo centrado en columna.
 *
 * Todo en puntos: 8 por milímetro a 203 dpi.
 */
import { MONOGRAMAS } from './logo-etiqueta.ts'
import type { RasterImage } from './escpos.ts'
import {
  FUENTES_TSPL,
  medirTexto,
  modulosDeCodigo,
  PUNTOS_POR_MM,
  tipoDeCodigo,
  TsplBuilder,
  type ConfigEtiquetadora,
  type FuenteTspl,
} from './tspl.ts'

export interface FormatoEtiqueta {
  id: string
  nombre: string
  anchoMm: number
  altoMm: number
  separacionMm: number
}

/**
 * Las medidas de etiqueta que se venden para etiquetadoras de 58 mm en
 * México. El ancho máximo de la Hanna58 es 58 mm; por debajo de 30 × 20 no
 * caben a la vez el monograma, el precio y un código de barras legible.
 */
export const FORMATOS_ETIQUETA: readonly FormatoEtiqueta[] = [
  { id: '30x20', nombre: '30 × 20 mm', anchoMm: 30, altoMm: 20, separacionMm: 2 },
  { id: '40x25', nombre: '40 × 25 mm', anchoMm: 40, altoMm: 25, separacionMm: 2 },
  { id: '40x30', nombre: '40 × 30 mm', anchoMm: 40, altoMm: 30, separacionMm: 2 },
  { id: '50x25', nombre: '50 × 25 mm', anchoMm: 50, altoMm: 25, separacionMm: 2 },
  { id: '51x25', nombre: '51 × 25 mm (2 × 1 pulgadas)', anchoMm: 50.8, altoMm: 25.4, separacionMm: 3 },
  { id: '50x30', nombre: '50 × 30 mm', anchoMm: 50, altoMm: 30, separacionMm: 2 },
  { id: '50x40', nombre: '50 × 40 mm', anchoMm: 50, altoMm: 40, separacionMm: 2 },
  { id: '57x32', nombre: '57 × 32 mm', anchoMm: 57, altoMm: 32, separacionMm: 2 },
  { id: '57x40', nombre: '57 × 40 mm', anchoMm: 57, altoMm: 40, separacionMm: 2 },
  { id: '58x30', nombre: '58 × 30 mm', anchoMm: 58, altoMm: 30, separacionMm: 2 },
  { id: '58x40', nombre: '58 × 40 mm', anchoMm: 58, altoMm: 40, separacionMm: 2 },
  { id: '58x60', nombre: '58 × 60 mm', anchoMm: 58, altoMm: 60, separacionMm: 2 },
  { id: '40x60', nombre: '40 × 60 mm (colgante)', anchoMm: 40, altoMm: 60, separacionMm: 2 },
  { id: '50x70', nombre: '50 × 70 mm (colgante)', anchoMm: 50, altoMm: 70, separacionMm: 3 },
]

export const MEDIDA_MINIMA_MM = { ancho: 30, alto: 20 }
export const MEDIDA_MAXIMA_MM = { ancho: 58, alto: 120 }

export interface DatosEtiqueta {
  nombre: string
  /** «Mediana / Negro». `null` en prendas sin variantes. */
  detalle: string | null
  precioCents: number
  sku: string
  /** El de proveedor, si la variante lo tiene. Si no, se codifica el SKU. */
  codigoBarras: string | null
  copias: number
}

export type AjustesEtiqueta = Omit<ConfigEtiquetadora, 'anchoMm' | 'altoMm' | 'separacionMm'>

/** `$1,890` o `$1,890.50`. Sin «MXN»: en 5 cm de etiqueta sobra. */
export function precioEtiqueta(cents: number): string {
  const pesos = Math.floor(cents / 100)
  const miles = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const resto = cents % 100
  return resto === 0 ? `$${miles}` : `$${miles}.${String(resto).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Composición
// ---------------------------------------------------------------------------

const FUENTES: FuenteTspl[] = ['5', '4', '3', '2', '1']

/** La fuente (y su escala) más grande cuyo texto cabe en `ancho` × `alto`. */
function fuenteQueCabe(
  texto: string,
  ancho: number,
  alto: number,
  opciones: { min?: FuenteTspl; max?: FuenteTspl; escalas?: number[] } = {},
): { fuente: FuenteTspl; escala: number } | null {
  const escalas = opciones.escalas ?? [1]
  const desde = FUENTES.indexOf(opciones.max ?? '5')
  const hasta = FUENTES.indexOf(opciones.min ?? '1')
  for (const escala of [...escalas].sort((a, b) => b - a)) {
    for (let i = desde; i <= hasta; i++) {
      const fuente = FUENTES[i]!
      const m = medirTexto(texto, fuente, escala)
      if (m.ancho <= ancho && m.alto <= alto) return { fuente, escala }
    }
  }
  return null
}

/** Parte por palabras en renglones de `columnas` caracteres; corta con «.» lo que no cabe. */
function renglones(texto: string, columnas: number, maximo: number): string[] {
  const palabras = texto.trim().split(/\s+/).filter(Boolean)
  const salida: string[] = []
  let actual = ''
  for (const p of palabras) {
    const candidato = actual ? `${actual} ${p}` : p
    if (candidato.length <= columnas) {
      actual = candidato
      continue
    }
    if (actual) salida.push(actual)
    actual = p.length > columnas ? p.slice(0, columnas) : p
  }
  if (actual) salida.push(actual)
  if (salida.length > maximo) {
    const ultimos = salida.slice(0, maximo)
    const u = ultimos[maximo - 1]!
    ultimos[maximo - 1] = u.length >= columnas ? `${u.slice(0, columnas - 1)}.` : `${u}.`
    return ultimos
  }
  return salida
}

/** El monograma más alto que no pasa de `alto` puntos. */
function monograma(alto: number): RasterImage | null {
  let elegido: RasterImage | null = null
  for (const m of MONOGRAMAS) if (m.height <= alto) elegido = m
  return elegido
}

interface Codigo {
  valor: string
  tipo: ReturnType<typeof tipoDeCodigo>
  modulo: number
  ancho: number
}

/** Valor, tipo y grosor de barra del código para un ancho disponible. */
function codigoPara(d: DatosEtiqueta, ancho: number): Codigo {
  const valor = (d.codigoBarras?.trim() || d.sku).toUpperCase()
  const tipo = tipoDeCodigo(valor)
  const modulos = modulosDeCodigo(valor, tipo)
  // Módulo de 2 puntos (0.25 mm) es lo que lee bien cualquier lector; 3 si
  // sobra sitio, 1 solo si no queda otra.
  const modulo = Math.max(1, Math.min(3, Math.floor(ancho / modulos)))
  return { valor, tipo, modulo, ancho: modulos * modulo }
}

/**
 * Dibuja UNA etiqueta en el lienzo (sin `CLS` ni `PRINT`). Devuelve avisos
 * cuando algo no cupo: un código de barras de módulo 1 o más ancho que la
 * etiqueta no se lee bien y la pantalla debe decirlo.
 */
export function dibujarEtiqueta(t: TsplBuilder, d: DatosEtiqueta): string[] {
  const W = t.anchoPuntos
  const H = t.altoPuntos
  const avisos: string[] = []
  const margen = Math.max(8, Math.round(Math.min(W, H) * 0.05))
  const util = W - margen * 2
  const colgante = H > W * 1.15

  // El código puede acercarse más al borde que el texto: con 1 mm de margen
  // blanco a cada lado los lectores lo leen, y ese milímetro decide si la
  // barra sale de 2 puntos (bien) o de 1 (al límite) en etiquetas de 40 mm.
  const anchoCodigo = W - PUNTOS_POR_MM * 2
  const codigo = codigoPara(d, anchoCodigo)
  if (codigo.ancho > anchoCodigo) avisos.push(`El código ${codigo.valor} no cabe completo en ${W / PUNTOS_POR_MM} mm`)
  else if (codigo.modulo === 1) avisos.push(`El código ${codigo.valor} sale muy fino; una etiqueta más ancha se lee mejor`)

  const precio = precioEtiqueta(d.precioCents)
  const sku = d.sku.toUpperCase()

  if (colgante) {
    colgada(t, d, { W, H, margen, util, codigo, precio, sku })
  } else {
    apaisada(t, d, { W, H, margen, util, codigo, precio, sku })
  }
  return avisos
}

interface Medidas {
  W: number
  H: number
  margen: number
  util: number
  codigo: Codigo
  precio: string
  sku: string
}

function apaisada(t: TsplBuilder, d: DatosEtiqueta, m: Medidas): void {
  const { W, H, margen, util, codigo, precio, sku } = m
  const interior = H - margen * 2

  // Reparto del alto: cabecera 30 %, renglón de precio 24 %, código el resto.
  const altoCabecera = Math.round(interior * 0.3)
  const altoPrecio = Math.round(interior * 0.24)
  const fuenteSku: FuenteTspl = interior >= 200 ? '2' : '1'
  const altoSku = FUENTES_TSPL[fuenteSku].alto
  const separa = Math.max(3, Math.round(interior * 0.025))

  // ---- Cabecera: monograma a la izquierda, nombre a su lado ----
  let y = margen
  const logo = monograma(altoCabecera)
  let xNombre = margen
  if (logo) {
    t.imagen(margen, y + Math.floor((altoCabecera - logo.height) / 2), logo)
    xNombre = margen + logo.width + Math.max(6, Math.round(logo.width * 0.25))
  }
  const anchoNombre = W - margen - xNombre
  escribirNombre(t, d.nombre, xNombre, y, anchoNombre, altoCabecera, 'left')
  y += altoCabecera + separa

  // ---- Talla/color a la izquierda, precio a la derecha ----
  const fPrecio =
    fuenteQueCabe(precio, Math.round(util * 0.6), altoPrecio, { max: '5', min: '2', escalas: [1] }) ??
    ({ fuente: '2', escala: 1 } as const)
  const mPrecio = medirTexto(precio, fPrecio.fuente, fPrecio.escala)
  t.texto(W - margen - mPrecio.ancho, y + Math.max(0, altoPrecio - mPrecio.alto), precio, fPrecio.fuente, fPrecio.escala)

  if (d.detalle) {
    const libre = util - mPrecio.ancho - 8
    // Si «Extra grande / Azul marino» no cabe ni en la fuente más chica, se
    // queda la talla sola —es lo que la clienta busca en la etiqueta— y solo
    // si tampoco cabe, se recorta.
    const talla = d.detalle.split(' / ')[0]!
    const columnas = Math.floor(libre / FUENTES_TSPL['1'].ancho)
    const opciones = [d.detalle, talla, talla.slice(0, columnas)]
    for (const texto of opciones) {
      const f = fuenteQueCabe(texto, libre, altoPrecio, { max: '3', min: '1' })
      if (!f || texto.length < 2) continue
      const md = medirTexto(texto, f.fuente, f.escala)
      t.texto(margen, y + Math.max(0, altoPrecio - md.alto), texto, f.fuente, f.escala)
      break
    }
  }
  y += altoPrecio + separa

  // ---- Código de barras y SKU, centrados ----
  const altoBarras = Math.max(24, H - margen - y - altoSku - 2)
  t.codigoBarras(Math.max(PUNTOS_POR_MM, Math.round((W - codigo.ancho) / 2)), y, codigo.tipo, altoBarras, codigo.modulo, codigo.valor)
  const mSku = medirTexto(sku, fuenteSku)
  t.texto(Math.max(margen, Math.round((W - mSku.ancho) / 2)), y + altoBarras + 2, sku, fuenteSku)
}

function colgada(t: TsplBuilder, d: DatosEtiqueta, m: Medidas): void {
  const { W, H, margen, util, codigo, precio, sku } = m
  const interior = H - margen * 2
  const separa = Math.max(4, Math.round(interior * 0.025))
  const fuenteSku: FuenteTspl = W >= 360 ? '2' : '1'
  const altoSku = FUENTES_TSPL[fuenteSku].alto

  let y = margen
  const logo = monograma(Math.round(interior * 0.16))
  if (logo) {
    t.imagen(Math.round((W - logo.width) / 2), y, logo)
    y += logo.height + separa * 2
  }

  const altoNombre = Math.round(interior * 0.2)
  y += escribirNombre(t, d.nombre, margen, y, util, altoNombre, 'center') + separa

  if (d.detalle) {
    const f = fuenteQueCabe(d.detalle, util, Math.round(interior * 0.08), { max: '3', min: '1' })
    if (f) {
      const md = medirTexto(d.detalle, f.fuente, f.escala)
      t.texto(Math.round((W - md.ancho) / 2), y, d.detalle, f.fuente, f.escala)
      y += md.alto + separa
    }
  }

  const fPrecio =
    fuenteQueCabe(precio, util, Math.round(interior * 0.14), { max: '5', min: '2', escalas: [2, 1] }) ??
    ({ fuente: '2', escala: 1 } as const)
  const mPrecio = medirTexto(precio, fPrecio.fuente, fPrecio.escala)
  t.texto(Math.round((W - mPrecio.ancho) / 2), y, precio, fPrecio.fuente, fPrecio.escala)
  y += mPrecio.alto + separa * 2

  // Una línea fina separa la parte de la clienta (arriba) de la del sistema.
  t.barra(margen * 2, y, W - margen * 4, 2)
  y += separa * 2

  const altoBarras = Math.max(32, Math.min(Math.round(interior * 0.22), H - margen - y - altoSku - 2))
  t.codigoBarras(Math.max(PUNTOS_POR_MM, Math.round((W - codigo.ancho) / 2)), y, codigo.tipo, altoBarras, codigo.modulo, codigo.valor)
  const mSku = medirTexto(sku, fuenteSku)
  t.texto(Math.max(margen, Math.round((W - mSku.ancho) / 2)), y + altoBarras + 2, sku, fuenteSku)
}

/**
 * El nombre de la prenda en hasta tres renglones (dos en etiquetas bajas),
 * con la fuente más grande que lo deje entero o casi. Devuelve el alto usado.
 */
function escribirNombre(
  t: TsplBuilder,
  nombre: string,
  x: number,
  y: number,
  ancho: number,
  alto: number,
  alinear: 'left' | 'center',
): number {
  const candidatas: FuenteTspl[] = ['4', '3', '2', '1']
  let elegido: { fuente: FuenteTspl; lineas: string[] } | null = null
  for (const fuente of candidatas) {
    const f = FUENTES_TSPL[fuente]
    const maximo = Math.min(3, Math.floor(alto / (f.alto + 2)))
    if (maximo < 1) continue
    const columnas = Math.floor(ancho / f.ancho)
    if (columnas < 4) continue
    const lineas = renglones(nombre, columnas, maximo)
    const cabeEntero = renglones(nombre, columnas, 99).length <= maximo
    // Se queda con la primera (la más grande) que lo deja entero; si ninguna
    // lo logra, con la más chica, que es la que recorta menos.
    elegido = { fuente, lineas }
    if (cabeEntero) break
  }
  if (!elegido) return 0

  const f = FUENTES_TSPL[elegido.fuente]
  const total = elegido.lineas.length * (f.alto + 2)
  // En la cabecera apaisada el nombre se centra en vertical junto al monograma.
  let yy = alinear === 'left' ? y + Math.max(0, Math.floor((alto - total) / 2)) : y
  for (const l of elegido.lineas) {
    const ml = medirTexto(l, elegido.fuente)
    const xx = alinear === 'center' ? x + Math.max(0, Math.round((ancho - ml.ancho) / 2)) : x
    t.texto(xx, yy, l, elegido.fuente)
    yy += f.alto + 2
  }
  return total
}

// ---------------------------------------------------------------------------
// Trabajos completos
// ---------------------------------------------------------------------------

function configuracion(formato: Pick<FormatoEtiqueta, 'anchoMm' | 'altoMm' | 'separacionMm'>, ajustes: AjustesEtiqueta): ConfigEtiquetadora {
  return { ...ajustes, anchoMm: formato.anchoMm, altoMm: formato.altoMm, separacionMm: formato.separacionMm }
}

/**
 * Un trabajo con todas las etiquetas: cada prenda distinta es un lienzo, y
 * sus copias salen con `PRINT 1,n` sin volver a mandar el dibujo.
 */
export function buildEtiquetas(
  items: DatosEtiqueta[],
  formato: Pick<FormatoEtiqueta, 'anchoMm' | 'altoMm' | 'separacionMm'>,
  ajustes: AjustesEtiqueta = {},
): { bytes: Uint8Array; avisos: string[] } {
  const t = new TsplBuilder(configuracion(formato, ajustes)).configurar()
  const avisos: string[] = []
  for (const d of items) {
    if (d.copias < 1) continue
    t.limpiar()
    avisos.push(...dibujarEtiqueta(t, d))
    t.imprimir(d.copias)
  }
  return { bytes: t.build(), avisos: [...new Set(avisos)] }
}

/**
 * La etiqueta de prueba: un recuadro al borde del área imprimible y una
 * etiqueta de ejemplo encima. Si el recuadro sale cortado o corrido, hay que
 * ajustar el desplazamiento o la medida; si sale en blanco, el sensor no
 * encontró el hueco (medida o separación equivocadas).
 */
export function buildEtiquetaPrueba(
  formato: Pick<FormatoEtiqueta, 'anchoMm' | 'altoMm' | 'separacionMm'>,
  ajustes: AjustesEtiqueta = {},
): Uint8Array {
  const t = new TsplBuilder(configuracion(formato, ajustes)).configurar().limpiar()
  t.caja(2, 2, t.anchoPuntos - 3, t.altoPuntos - 3, 2)
  dibujarEtiqueta(t, {
    nombre: 'Vestido Midi Satinado',
    detalle: 'Mediana / Negro',
    precioCents: 189000,
    sku: '1001-M-NEG',
    codigoBarras: null,
    copias: 1,
  })
  return t.imprimir(1).build()
}
