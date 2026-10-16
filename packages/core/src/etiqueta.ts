/**
 * La etiqueta de las prendas: monograma de Lumane, nombre, talla y color,
 * código de pieza (el SKU) y precio.
 *
 * Sin código de barras: en la boutique no hay lector, y lo que se teclea en
 * Venta es el código de pieza, así que ese espacio es para que el código, el
 * precio y el nombre se lean de lejos.
 *
 * Los textos van como IMAGEN, con Figtree (ver `letras.ts`): la Hanna58
 * imprime sus fuentes residentes 2, 3 y 4 del mismo tamaño, y una plantilla
 * que confía en ellas sale chica y apretada.
 *
 * El diseño se calcula para la medida de la etiqueta en vez de fijarse para
 * una sola: los rollos cambian de proveedor y de tamaño. Hay dos composiciones:
 *
 *  - **Apaisada** (más ancha que alta, la mayoría): monograma y nombre arriba;
 *    abajo, talla y código de pieza a la izquierda y el precio en grande a la
 *    derecha, sobre la misma línea base que el código.
 *  - **Colgante** (más alta que ancha o casi cuadrada: 40 × 60, 58 × 60):
 *    todo centrado en columna.
 *
 * Todo en puntos: 8 por milímetro a 203 dpi.
 */
import type { RasterImage } from './escpos.ts'
import { anchoTexto, letra, partirEnRenglones, recortar, tamañosDe, textoEnBits, type Letra, type TextoEnBits } from './letras.ts'
import { MONOGRAMAS } from './logo-etiqueta.ts'
import { TsplBuilder, type ConfigEtiquetadora } from './tspl.ts'

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
 * caben a la vez el monograma, el nombre y un precio legible.
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

export type PapelTexto = 'nombre' | 'detalle' | 'sku' | 'precio'

/** Lo que lleva una etiqueta, ya colocado, antes de convertirse en TSPL. */
export type PiezaEtiqueta =
  | { tipo: 'texto'; papel: PapelTexto; contenido: string; letra: number; x: number; y: number; imagen: RasterImage }
  | { tipo: 'logo'; x: number; y: number; imagen: RasterImage }
  | { tipo: 'linea'; x: number; y: number; ancho: number; alto: number }

export interface ComposicionEtiqueta {
  piezas: PiezaEtiqueta[]
  /** Lo que no cupo entero: la pantalla lo enseña, no frena la impresión. */
  avisos: string[]
}

/** El monograma más alto que no pasa de `alto` puntos. */
function monograma(alto: number): RasterImage | null {
  let elegido: RasterImage | null = null
  for (const m of MONOGRAMAS) if (m.height <= alto) elegido = m
  return elegido
}

/** Tamaños de un peso de mayor a menor, entre `min` y `max`. */
function tamañosEntre(peso: 'bold' | 'extrabold', min: number, max: number): number[] {
  const todos = tamañosDe(peso)
  const dentro = todos.filter((t) => t >= min && t <= max).reverse()
  return dentro.length ? dentro : [todos.filter((t) => t <= max).at(-1) ?? todos[0]!]
}

interface Bloque {
  texto: TextoEnBits
  letra: Letra
  contenido: string
  completo: boolean
}

/** El texto en la letra más grande (de `tamaños`) que lo deja entero en `renglones` de `ancho`. */
function bloqueQueCabe(
  texto: string,
  tamaños: number[],
  ancho: number,
  renglones: number,
  alinear: 'left' | 'center' | 'right' = 'left',
): Bloque {
  let ultimo: Bloque | null = null
  for (const t of tamaños) {
    const l = letra('bold', t)
    const p = partirEnRenglones(texto, l, ancho, renglones)
    ultimo = {
      texto: textoEnBits(p.renglones, l, { alinear, interlineado: Math.round(l.tamaño * 1.12) }),
      letra: l,
      contenido: p.renglones.join(' '),
      completo: p.completo,
    }
    if (p.completo) return ultimo
  }
  return ultimo!
}

/** El texto en un renglón con la letra más grande de `tamaños` que cabe en `ancho`, o `null`. */
function renglonQueCabe(texto: string, tamaños: number[], ancho: number, alinear: 'left' | 'center'): Bloque | null {
  for (const t of tamaños) {
    const l = letra('bold', t)
    if (anchoTexto(texto, l) <= ancho) return { texto: textoEnBits([texto], l, { alinear }), letra: l, contenido: texto, completo: true }
  }
  return null
}

/**
 * La talla y el color; si no caben, solo la talla —es lo que la clienta busca
 * en la etiqueta—, y si tampoco, recortada.
 */
function bloqueDetalle(detalle: string, tamaños: number[], ancho: number, alinear: 'left' | 'center'): Bloque {
  const entero = renglonQueCabe(detalle, tamaños, ancho, alinear)
  if (entero) return entero
  const talla = detalle.split(' / ')[0]!.trim()
  const soloTalla = renglonQueCabe(talla, tamaños, ancho, alinear)
  if (soloTalla) return { ...soloTalla, completo: false }
  const l = letra('bold', tamaños.at(-1)!)
  const corto = recortar(talla, l, ancho)
  return { texto: textoEnBits([corto], l, { alinear }), letra: l, contenido: corto, completo: false }
}

/** El precio en ExtraBold, lo más grande que quepa en `ancho`, sin bajar de `min`. */
function bloquePrecio(precio: string, max: number, min: number, ancho: number): Bloque {
  const tamaños = tamañosEntre('extrabold', 0, max)
  for (const t of tamaños) {
    const l = letra('extrabold', t)
    if (t < min) break
    if (anchoTexto(precio, l) <= ancho) return { texto: textoEnBits([precio], l), letra: l, contenido: precio, completo: true }
  }
  const l = letra('extrabold', Math.max(min, tamaños.at(-1)!))
  return { texto: textoEnBits([precio], l), letra: l, contenido: precio, completo: anchoTexto(precio, l) <= ancho }
}

function pieza(papel: PapelTexto, b: Bloque, x: number, y: number): PiezaEtiqueta {
  return { tipo: 'texto', papel, contenido: b.contenido, letra: b.letra.tamaño, x: Math.round(x), y: Math.round(y), imagen: b.texto.imagen }
}

/** Abajo de la tinta respecto a su línea base. */
function bajada(b: Bloque): number {
  return b.texto.imagen.height - b.texto.base
}

interface Intento extends ComposicionEtiqueta {
  /** Puntos libres en vertical; negativo si no cupo. */
  sobra: number
  completo: boolean
}

/**
 * Prueba la composición de mayor a menor: la primera escala en la que todo
 * cabe entero gana; si ninguna, la primera que cabe aunque recorte; si
 * tampoco, la más chica.
 */
function elegir(k0: number, componer: (k: number) => Intento): ComposicionEtiqueta {
  let cabe: Intento | null = null
  let ultimo: Intento | null = null
  for (let i = 0; i < 12; i++) {
    ultimo = componer(k0 * 0.92 ** i)
    if (ultimo.sobra < 0) continue
    if (ultimo.completo) return { piezas: ultimo.piezas, avisos: ultimo.avisos }
    cabe ??= ultimo
  }
  const elegido = cabe ?? ultimo!
  return { piezas: elegido.piezas, avisos: elegido.avisos }
}

export function componerEtiqueta(d: DatosEtiqueta, W: number, H: number): ComposicionEtiqueta {
  // 1.5 mm de borde como mínimo: la etiqueta física casi nunca cae exacta
  // bajo el cabezal y lo que roza la orilla sale cortado.
  const margen = Math.max(12, Math.round(Math.min(W, H) * 0.06))
  // Las casi cuadradas (58 × 60) también van en columna: apaisadas les queda
  // un hueco enorme entre el nombre y el precio.
  const colgante = H > W * 0.9
  const precio = precioEtiqueta(d.precioCents)
  const sku = d.sku.trim().toUpperCase()
  if (colgante) {
    const k0 = Math.min((W - margen * 2) / 282, (H - margen * 2) / 442)
    return elegir(k0, (k) => colgada(d, W, H, margen, k, precio, sku))
  }
  // Las medidas de referencia son las de 50 × 25 mm (376 × 176 útiles).
  const k0 = Math.min((H - margen * 2) / 176, ((W - margen * 2) / 376) * 1.2)
  return elegir(k0, (k) => apaisada(d, W, H, margen, k, precio, sku))
}

function apaisada(d: DatosEtiqueta, W: number, H: number, m: number, k: number, precio: string, sku: string): Intento {
  const util = W - m * 2
  const interior = H - m * 2
  const avisos: string[] = []
  const hueco = Math.max(10, Math.round(16 * k))
  const piezas: PiezaEtiqueta[] = []

  // ---- Abajo: código de pieza a la izquierda, precio a la derecha ----
  const bSku = bloqueQueCabe(sku, tamañosEntre('bold', 14, 24 * k), util * 0.5, 1)
  if (!bSku.completo) avisos.push(`El código ${sku} no cabe completo`)
  const libreParaPrecio = util - bSku.texto.ancho - hueco
  const bPrecio = bloquePrecio(precio, 64 * k, Math.round(bSku.letra.tamaño * 1.3), libreParaPrecio)

  const base = H - m - Math.max(bajada(bSku), bajada(bPrecio))
  const ySku = base - bSku.texto.base
  const yPrecio = base - bPrecio.texto.base
  piezas.push(pieza('sku', bSku, m, ySku))
  piezas.push(pieza('precio', bPrecio, W - m - bPrecio.texto.ancho, yPrecio))
  let techo = Math.min(ySku, yPrecio)

  // ---- Talla y color: encima del código y al lado del precio; si no cabe
  // ahí, en su propio renglón encima del precio ----
  const detalle = d.detalle?.trim()
  if (detalle) {
    const lado = util - bPrecio.texto.ancho - hueco
    // Al lado solo si no hay que encogerla mucho: chiquita junto al precio se
    // pierde, y encima del precio cabe más grande.
    const alLado = renglonQueCabe(detalle, tamañosEntre('bold', Math.max(14, 18 * k), 22 * k), lado, 'left')
    const encima = alLado ? null : renglonQueCabe(detalle, tamañosEntre('bold', 14, 22 * k), util, 'left')
    const bDet = alLado ?? encima ?? bloqueDetalle(detalle, tamañosEntre('bold', 14, 22 * k), lado, 'left')
    // De la línea base de la talla a la tinta de abajo: lo que baja la «g»
    // y un respiro.
    const debajo = encima ? Math.min(ySku, yPrecio) : ySku
    const baseDet = debajo - Math.max(4, Math.round(bDet.letra.tamaño * 0.3)) - bDet.letra.descendente
    const yDet = baseDet - bDet.texto.base
    piezas.push(pieza('detalle', bDet, m, yDet))
    techo = Math.min(techo, yDet)
    if (!bDet.completo) avisos.push(`«${detalle}» no cabe completo; va ${bDet.contenido}`)
  }

  // ---- Arriba: monograma y nombre ----
  const altoMax = techo - m - Math.max(6, Math.round(10 * k))
  const logo = monograma(Math.min(altoMax, 56 * k))
  const separaLogo = logo ? Math.max(8, Math.round(logo.width * 0.22)) : 0
  const xNombre = m + (logo ? logo.width + separaLogo : 0)
  const renglones = interior >= 260 ? 3 : 2
  const bNombre = bloqueQueCabe(d.nombre, tamañosEntre('bold', 14, 30 * k), W - m - xNombre, renglones)
  if (!bNombre.completo) avisos.push(`El nombre «${d.nombre}» no cabe completo`)

  const altoNombre = bNombre.texto.imagen.height
  const altoCabecera = Math.max(altoNombre, logo?.height ?? 0)
  piezas.push(pieza('nombre', bNombre, xNombre, m + Math.floor((altoCabecera - altoNombre) / 2)))
  if (logo) piezas.push({ tipo: 'logo', x: m, y: m + Math.floor((altoCabecera - logo.height) / 2), imagen: logo })

  const sobra = techo - (m + altoCabecera) - Math.max(6, Math.round(10 * k))
  // Con aire de sobra, una línea fina separa la prenda de lo que cuesta.
  if (sobra >= 10) {
    const y = Math.round(m + altoCabecera + (techo - m - altoCabecera) / 2) - 1
    piezas.push({ tipo: 'linea', x: m, y, ancho: util, alto: 2 })
  }

  return {
    piezas,
    avisos,
    sobra,
    completo: bNombre.completo && bSku.completo && bPrecio.completo && avisos.length === 0,
  }
}

function colgada(d: DatosEtiqueta, W: number, H: number, m: number, k: number, precio: string, sku: string): Intento {
  const util = W - m * 2
  const interior = H - m * 2
  const avisos: string[] = []
  const separa = Math.max(8, Math.round(14 * k))

  const logo = monograma(64 * k)
  const bNombre = bloqueQueCabe(d.nombre, tamañosEntre('bold', 14, 32 * k), util, 3, 'center')
  if (!bNombre.completo) avisos.push(`El nombre «${d.nombre}» no cabe completo`)
  const bDet = d.detalle?.trim() ? bloqueDetalle(d.detalle.trim(), tamañosEntre('bold', 14, 24 * k), util, 'center') : null
  if (bDet && !bDet.completo) avisos.push(`«${d.detalle}» no cabe completo; va ${bDet.contenido}`)
  const bSku = bloqueQueCabe(sku, tamañosEntre('bold', 14, 26 * k), util, 1, 'center')
  if (!bSku.completo) avisos.push(`El código ${sku} no cabe completo`)
  const bPrecio = bloquePrecio(precio, 72 * k, Math.round(bSku.letra.tamaño * 1.3), util)

  // De arriba abajo, con un hueco entre cada pieza; la línea va entre la
  // talla y el precio.
  const pila: ({ alto: number; poner: (y: number) => PiezaEtiqueta } | 'linea')[] = []
  if (logo) pila.push({ alto: logo.height, poner: (y) => ({ tipo: 'logo', x: Math.round((W - logo.width) / 2), y, imagen: logo }) })
  const centrado = (papel: PapelTexto, b: Bloque) => ({
    alto: b.texto.imagen.height,
    poner: (y: number) => pieza(papel, b, (W - b.texto.ancho) / 2, y),
  })
  pila.push(centrado('nombre', bNombre))
  if (bDet) pila.push(centrado('detalle', bDet))
  pila.push('linea')
  pila.push(centrado('precio', bPrecio))
  pila.push(centrado('sku', bSku))

  const altoLinea = 2
  const ocupado = pila.reduce((s, p) => s + (p === 'linea' ? altoLinea : p.alto), 0)
  const huecos = pila.length - 1
  const sobra = interior - ocupado - huecos * separa
  // El aire de más se reparte entre los huecos (hasta el doble) y lo que
  // quede, arriba y abajo para centrar la columna.
  const extra = Math.max(0, Math.min(separa, Math.floor(sobra / huecos)))
  const paso = separa + extra
  let y = m + Math.max(0, Math.floor((sobra - extra * huecos) / 2))

  const piezas: PiezaEtiqueta[] = []
  for (const p of pila) {
    if (p === 'linea') {
      const ancho = Math.round(util * 0.4)
      piezas.push({ tipo: 'linea', x: Math.round((W - ancho) / 2), y, ancho, alto: altoLinea })
      y += altoLinea + paso
    } else {
      piezas.push(p.poner(y))
      y += p.alto + paso
    }
  }

  return {
    piezas,
    avisos,
    sobra,
    completo: bNombre.completo && bSku.completo && bPrecio.completo && avisos.length === 0,
  }
}

/**
 * Dibuja UNA etiqueta en el lienzo (sin `CLS` ni `PRINT`). Devuelve avisos
 * cuando algo no cupo entero, para enseñarlos en pantalla.
 */
export function dibujarEtiqueta(t: TsplBuilder, d: DatosEtiqueta): string[] {
  const { piezas, avisos } = componerEtiqueta(d, t.anchoPuntos, t.altoPuntos)
  for (const p of piezas) {
    if (p.tipo === 'linea') t.barra(p.x, p.y, p.ancho, p.alto)
    else t.imagen(p.x, p.y, p.imagen)
  }
  return avisos
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

/** La prenda de muestra de la etiqueta de prueba y de la vista previa de Impresora. */
export const PRENDA_DE_MUESTRA: DatosEtiqueta = {
  nombre: 'Vestido Midi Satinado',
  detalle: 'Mediana / Negro',
  precioCents: 189000,
  sku: '1001-M-NEG',
  copias: 1,
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
  dibujarEtiqueta(t, PRENDA_DE_MUESTRA)
  return t.imprimir(1).build()
}
