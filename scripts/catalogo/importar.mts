/**
 * Importa la plantilla de Excel del catálogo: prendas, tallas/colores,
 * precios, existencias y fotos.
 *
 *   node scripts/catalogo/importar.mts "ruta/al/archivo.xlsx"              # solo revisa
 *   node scripts/catalogo/importar.mts "ruta/al/archivo.xlsx" --de-verdad  # revisa y sube
 *   … --fotos "ruta/a/la/carpeta"   (por omisión: carpeta «fotos» junto al Excel, o la del Excel)
 *
 * Primero lee el archivo ENTERO y lo valida; si hay un solo error no sube
 * nada y dice fila por fila qué corregir. Después sube prenda por prenda con
 * `importar_prenda` (migración 0074), que reutiliza el RPC de la caja: el
 * archivo pasa por las mismas reglas que una prenda dada de alta en la tablet.
 *
 * Reimportar el mismo archivo corregido es seguro: la prenda se reconoce por
 * su código y la variante por su SKU, y las existencias se fijan, no se suman.
 */
import ExcelJS from 'exceljs'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { normalizarCodigo, sinAcentos, skuDeVariante, sugerirCodigo } from '../../packages/core/src/variantes.ts'
import { COLUMNAS, HOJA_CATALOGO } from './columnas.mjs'

const RAIZ = path.resolve(import.meta.dirname, '..', '..')
const args = process.argv.slice(2)
const DE_VERDAD = args.includes('--de-verdad')
const archivo = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--fotos')
if (!archivo) {
  console.error('Uso: node scripts/catalogo/importar.mts "archivo.xlsx" [--fotos carpeta] [--de-verdad]')
  process.exit(1)
}
const iFotos = args.indexOf('--fotos')
const carpetaFotos =
  iFotos >= 0
    ? path.resolve(args[iFotos + 1]!)
    : existsSync(path.join(path.dirname(path.resolve(archivo)), 'fotos'))
      ? path.join(path.dirname(path.resolve(archivo)), 'fotos')
      : path.dirname(path.resolve(archivo))

// ---------------------------------------------------------------------------
// Leer
// ---------------------------------------------------------------------------

type Clave = (typeof COLUMNAS)[number]['clave']
type Fila = Partial<Record<Clave, string>> & { _fila: number }

/** Lo que ExcelJS devuelve en una celda, a texto plano. */
function texto(v: ExcelJS.CellValue): string {
  if (v == null) return ''
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('').trim()
    if ('text' in v) return String(v.text).trim()
    if ('result' in v) return texto(v.result as ExcelJS.CellValue)
  }
  return String(v).trim()
}

function sinMarcas(s: string): string {
  return sinAcentos(s).toLowerCase().replace(/\*/g, '').replace(/\s+/g, ' ').trim()
}

async function leer(ruta: string): Promise<Fila[]> {
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.readFile(ruta)
  const hoja = libro.getWorksheet(HOJA_CATALOGO) ?? libro.worksheets.find((h) => h.state !== 'hidden')
  if (!hoja) throw new Error('El archivo no tiene la hoja «Catálogo»')

  // Las columnas se reconocen por su título, no por su posición: si alguien
  // mueve o borra una columna opcional, el resto sigue leyéndose bien.
  const porTitulo = new Map(COLUMNAS.map((c) => [sinMarcas(c.titulo), c.clave]))
  const columnas = new Map<number, Clave>()
  hoja.getRow(1).eachCell((celda, n) => {
    const clave = porTitulo.get(sinMarcas(texto(celda.value)))
    if (clave) columnas.set(n, clave)
  })
  for (const c of COLUMNAS.filter((c) => c.obligatoria)) {
    if (![...columnas.values()].includes(c.clave)) throw new Error(`Falta la columna «${c.titulo}»`)
  }

  const filas: Fila[] = []
  hoja.eachRow((row, n) => {
    if (n === 1) return
    const fila: Fila = { _fila: n }
    let vacia = true
    for (const [col, clave] of columnas) {
      const valor = texto(row.getCell(col).value)
      if (valor !== '') {
        fila[clave] = valor
        vacia = false
      }
    }
    if (!vacia) filas.push(fila)
  })
  return filas
}

// ---------------------------------------------------------------------------
// Interpretar y validar
// ---------------------------------------------------------------------------

interface Variante {
  fila: number
  talla: string | null
  color: string | null
  sku: string
  barcode: string | null
  precio: number
  precioAntes: number | null
  costo: number | null
  existencias: number
  ubicacion: string | null
  minimo: number | null
}

interface Prenda {
  filas: number[]
  codigo: string
  codigoAsignado: boolean
  nombre: string
  categoria: string
  marca: string
  descripcionCorta: string
  descripcion: string
  composicion: string
  cuidados: string
  colecciones: string[] | null
  fotos: string[]
  enLinea: boolean
  estado: 'active' | 'draft'
  variantes: Variante[]
}

const errores: string[] = []
const avisos: string[] = []
const error = (fila: number | number[], msg: string) =>
  errores.push(`  Fila ${Array.isArray(fila) ? fila.join(', ') : fila}: ${msg}`)

function centavos(valor: string | undefined, fila: number, campo: string, obligatorio: boolean): number | null {
  if (!valor) {
    if (obligatorio) error(fila, `falta ${campo}`)
    return null
  }
  const limpio = valor.replace(/[$\s]/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = Number(limpio)
  if (!Number.isFinite(n) || n < 0) {
    error(fila, `${campo} «${valor}» no es un importe válido`)
    return null
  }
  return Math.round(n * 100)
}

function entero(valor: string | undefined, fila: number, campo: string, obligatorio: boolean): number | null {
  if (!valor) {
    if (obligatorio) error(fila, `falta ${campo}`)
    return null
  }
  const n = Number(valor.replace(/\s/g, ''))
  if (!Number.isInteger(n) || n < 0) {
    error(fila, `${campo} «${valor}» tiene que ser un número entero de 0 o más`)
    return null
  }
  return n
}

function siNo(valor: string | undefined, fila: number): boolean {
  if (!valor) return true
  const v = sinMarcas(valor)
  if (['si', 'sí', 's', 'yes', '1', 'x', 'verdadero', 'true'].includes(v)) return true
  if (['no', 'n', '0', 'falso', 'false'].includes(v)) return false
  error(fila, `«En tienda en línea» tiene que ser Sí o No (dice «${valor}»)`)
  return true
}

function estado(valor: string | undefined, fila: number): 'active' | 'draft' {
  if (!valor) return 'active'
  const v = sinMarcas(valor)
  if (v.startsWith('activ') || v === 'publicado') return 'active'
  if (v.startsWith('borrador') || v === 'draft') return 'draft'
  error(fila, `«Estado» tiene que ser Activo o Borrador (dice «${valor}»)`)
  return 'active'
}

/** Varias líneas en una celda: separadas por «;» o saltos de línea. */
function lineas(valor: string | undefined): string {
  return (valor ?? '')
    .split(/[;\n]/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
}

function agrupar(filas: Fila[]): Prenda[] {
  const grupos = new Map<string, Fila[]>()
  for (const f of filas) {
    // Con código, agrupa el código; sin él, el nombre. Así dos prendas que se
    // llamen igual pero tengan código distinto no se mezclan.
    const clave = f.codigo ? `c:${normalizarCodigo(f.codigo)}` : `n:${sinMarcas(f.nombre ?? '')}`
    if (clave === 'n:') {
      error(f._fila, 'falta el nombre de la prenda')
      continue
    }
    grupos.set(clave, [...(grupos.get(clave) ?? []), f])
  }

  const prendas: Prenda[] = []
  for (const filasPrenda of grupos.values()) {
    const numeros = filasPrenda.map((f) => f._fila)
    // De la prenda: el primer valor no vacío. Si otra fila trae otro, se avisa.
    const dePrenda = (clave: Clave): string => {
      const valores = [...new Set(filasPrenda.map((f) => f[clave]).filter((v): v is string => Boolean(v)))]
      if (valores.length > 1 && clave !== 'fotos') {
        avisos.push(`  Filas ${numeros.join(', ')}: «${COLUMNAS.find((c) => c.clave === clave)!.titulo}» trae valores distintos; se usa «${valores[0]}»`)
      }
      return valores[0] ?? ''
    }

    const nombre = dePrenda('nombre')
    const categoria = dePrenda('categoria')
    if (!nombre) error(numeros, 'falta el nombre de la prenda')
    if (!categoria) error(numeros, `«${nombre}» no tiene categoría (ponla en su primera fila)`)

    const colecciones = filasPrenda.some((f) => f.colecciones !== undefined)
      ? dePrenda('colecciones').split(',').map((c) => c.trim()).filter(Boolean)
      : null

    const prenda: Prenda = {
      filas: numeros,
      codigo: normalizarCodigo(dePrenda('codigo')),
      codigoAsignado: false,
      nombre,
      categoria,
      marca: dePrenda('marca'),
      descripcionCorta: dePrenda('descripcion_corta'),
      descripcion: dePrenda('descripcion'),
      composicion: lineas(dePrenda('composicion')),
      cuidados: lineas(dePrenda('cuidados')),
      colecciones,
      fotos: [...new Set(filasPrenda.flatMap((f) => (f.fotos ?? '').split(',')).map((x) => x.trim()).filter(Boolean))],
      enLinea: siNo(dePrenda('en_linea') || undefined, numeros[0]!),
      estado: estado(dePrenda('estado') || undefined, numeros[0]!),
      variantes: [],
    }

    // Talla y color: o todas las filas los traen, o ninguna. Una prenda con
    // tallas y una fila sin talla no tiene a qué variante pertenecer.
    for (const opcion of ['talla', 'color'] as const) {
      const con = filasPrenda.filter((f) => f[opcion])
      if (con.length > 0 && con.length < filasPrenda.length) {
        const sin = filasPrenda.filter((f) => !f[opcion]).map((f) => f._fila)
        error(sin, `«${nombre}» tiene ${opcion} en otras filas pero no en esta`)
      }
    }

    for (const f of filasPrenda) {
      prenda.variantes.push({
        fila: f._fila,
        talla: f.talla?.trim() || null,
        color: f.color?.trim() || null,
        sku: normalizarCodigo(f.sku ?? ''),
        barcode: f.codigo_barras?.replace(/\s/g, '') || null,
        precio: centavos(f.precio, f._fila, 'el precio de venta', true) ?? 0,
        precioAntes: centavos(f.precio_antes, f._fila, 'el precio antes', false),
        costo: centavos(f.costo, f._fila, 'el costo', false),
        existencias: entero(f.existencias, f._fila, 'existencias', true) ?? 0,
        ubicacion: f.ubicacion?.trim() || null,
        minimo: entero(f.minimo, f._fila, '«Avisar con menos de»', false),
      })
    }

    for (const v of prenda.variantes) {
      if (v.precioAntes !== null && v.precioAntes <= v.precio) {
        error(v.fila, 'el «Precio antes» tiene que ser mayor que el precio de venta (o déjalo vacío)')
      }
    }

    // La misma talla y color dos veces en la misma prenda.
    const vistas = new Map<string, number>()
    for (const v of prenda.variantes) {
      const k = `${sinMarcas(v.talla ?? '')}|${sinMarcas(v.color ?? '')}`
      if (vistas.has(k)) error([vistas.get(k)!, v.fila], `«${nombre}» repite ${[v.talla, v.color].filter(Boolean).join(' / ') || 'la misma variante'}`)
      vistas.set(k, v.fila)
    }

    prendas.push(prenda)
  }
  return prendas
}

/** Los valores de una opción, en orden de aparición, con su sufijo para el SKU. */
function valoresDe(prenda: Prenda, opcion: 'talla' | 'color'): { value: string; code: string }[] {
  const valores: { value: string; code: string }[] = []
  for (const v of prenda.variantes) {
    const valor = v[opcion]
    if (valor && !valores.some((x) => sinMarcas(x.value) === sinMarcas(valor))) {
      // Dos valores con el mismo sufijo (Rosa y Rosado → ROS) darían el mismo
      // SKU: al segundo se le añade un número.
      let code = sugerirCodigo(valor) || 'X'
      const base = code
      for (let i = 2; valores.some((x) => x.code === code); i++) code = `${base}${i}`
      valores.push({ value: valor, code })
    }
  }
  return valores
}

function nombreOpcion(o: 'talla' | 'color') {
  return o === 'talla' ? 'Talla' : 'Color'
}

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

function leerEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env }
  try {
    for (const l of readFileSync(path.join(RAIZ, 'apps', 'web', '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(l)
      if (m && !env[m[1]!]) env[m[1]!] = m[2]!.trim()
    }
  } catch {}
  return env
}

const env = leerEnv()
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
  throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY en apps/web/.env.local')
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })

async function todas<T>(tabla: string, columnas: string): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error: e } = await sb.from(tabla).select(columnas).range(desde, desde + 999)
    if (e) throw new Error(`${tabla}: ${e.message}`)
    filas.push(...(data as T[]))
    if (data.length < 1000) return filas
  }
}

// ---------------------------------------------------------------------------
// Programa
// ---------------------------------------------------------------------------

console.log(`Leyendo ${path.basename(archivo)}…`)
const filas = await leer(path.resolve(archivo))
const prendas = agrupar(filas)

const [productos, variantes, colecciones] = await Promise.all([
  todas<{ id: string; code: string | null; name: string }>('products', 'id, code, name'),
  todas<{ product_id: string; sku: string; barcode: string | null }>('product_variants', 'product_id, sku, barcode'),
  todas<{ name: string; slug: string }>('collections', 'name, slug'),
])
const productoPorCodigo = new Map(productos.filter((p) => p.code).map((p) => [p.code!.toUpperCase(), p]))

// Códigos para las prendas que no traen: el siguiente número libre desde 1001,
// sin pisar los de la base ni los del propio archivo.
const usados = new Set([...productoPorCodigo.keys(), ...prendas.map((p) => p.codigo).filter(Boolean)])
let siguiente = Math.max(1000, ...[...usados].filter((c) => /^\d+$/.test(c)).map(Number)) + 1
for (const p of prendas) {
  if (p.codigo) continue
  while (usados.has(String(siguiente))) siguiente++
  p.codigo = String(siguiente++)
  p.codigoAsignado = true
  usados.add(p.codigo)
}

// Códigos repetidos entre prendas distintas del archivo (por nombre distinto).
const nombrePorCodigo = new Map<string, Prenda>()
for (const p of prendas) {
  const otra = nombrePorCodigo.get(p.codigo)
  if (otra) error([...otra.filas, ...p.filas], `el código ${p.codigo} lo usan dos prendas distintas`)
  nombrePorCodigo.set(p.codigo, p)
  const enBase = productoPorCodigo.get(p.codigo)
  if (enBase && sinMarcas(enBase.name) !== sinMarcas(p.nombre)) {
    avisos.push(`  Filas ${p.filas.join(', ')}: el código ${p.codigo} ya es «${enBase.name}» en la tienda; se actualizará con el nombre «${p.nombre}»`)
  }
}

// SKU de cada variante.
const opcionesDe = new Map<Prenda, ('talla' | 'color')[]>()
for (const p of prendas) {
  const usadas = (['talla', 'color'] as const).filter((o) => p.variantes.some((v) => v[o]))
  opcionesDe.set(p, usadas)
  const sufijos = Object.fromEntries(usadas.map((o) => [o, valoresDe(p, o)]))
  for (const v of p.variantes) {
    if (v.sku) continue
    v.sku = skuDeVariante(
      p.codigo,
      // Una fila sin el valor ya es un error; aquí solo no debe romper.
      usadas.map((o) => sufijos[o]!.find((x) => sinMarcas(x.value) === sinMarcas(v[o] ?? ''))?.code ?? ''),
    )
  }
}

// SKU y códigos de barras únicos: en el archivo y contra la base.
const idPorCodigo = new Map(prendas.map((p) => [p, productoPorCodigo.get(p.codigo)?.id ?? null]))
const dueñoSku = new Map(variantes.map((v) => [v.sku.toUpperCase(), v.product_id]))
const dueñoBarcode = new Map(variantes.filter((v) => v.barcode).map((v) => [v.barcode!, v.product_id]))
const skuEnArchivo = new Map<string, number>()
const barcodeEnArchivo = new Map<string, number>()
for (const p of prendas) {
  const propio = idPorCodigo.get(p)
  for (const v of p.variantes) {
    const otra = skuEnArchivo.get(v.sku)
    if (otra) error([otra, v.fila], `el SKU ${v.sku} sale dos veces`)
    skuEnArchivo.set(v.sku, v.fila)
    const dueño = dueñoSku.get(v.sku)
    if (dueño && dueño !== propio) error(v.fila, `el SKU ${v.sku} ya lo usa otra prenda de la tienda`)

    if (v.barcode) {
      const otraB = barcodeEnArchivo.get(v.barcode)
      if (otraB) error([otraB, v.fila], `el código de barras ${v.barcode} sale dos veces`)
      barcodeEnArchivo.set(v.barcode, v.fila)
      const dueñoB = dueñoBarcode.get(v.barcode)
      if (dueñoB && dueñoB !== propio) error(v.fila, `el código de barras ${v.barcode} ya lo usa otra prenda`)
    }
  }
}

// Colecciones: tienen que existir.
const nombresCol = new Set(colecciones.flatMap((c) => [sinMarcas(c.name), c.slug]))
for (const p of prendas) {
  for (const c of p.colecciones ?? []) {
    if (!nombresCol.has(sinMarcas(c))) {
      error(p.filas[0]!, `no existe la colección «${c}». Las que hay: ${colecciones.map((x) => x.name).join(', ')}`)
    }
  }
}

// Fotos: tienen que estar en la carpeta.
const archivosFotos = existsSync(carpetaFotos) ? readdirSync(carpetaFotos) : []
const fotoPorNombre = new Map(archivosFotos.map((f) => [f.toLowerCase(), path.join(carpetaFotos, f)]))
function rutaFoto(nombre: string): string | null {
  const n = nombre.toLowerCase()
  if (fotoPorNombre.has(n)) return fotoPorNombre.get(n)!
  // Sin extensión: la primera que coincida.
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp', '.heic']) if (fotoPorNombre.has(n + ext)) return fotoPorNombre.get(n + ext)!
  return null
}
for (const p of prendas) {
  for (const f of p.fotos) if (!rutaFoto(f)) error(p.filas[0]!, `no encuentro la foto «${f}» en ${carpetaFotos}`)
}

// ---------------------------------------------------------------------------
// Informe
// ---------------------------------------------------------------------------

const nuevas = prendas.filter((p) => !idPorCodigo.get(p))
const piezas = prendas.reduce((s, p) => s + p.variantes.reduce((t, v) => t + v.existencias, 0), 0)
console.log(`\n${filas.length} filas → ${prendas.length} prendas (${nuevas.length} nuevas, ${prendas.length - nuevas.length} ya existían), ${prendas.reduce((s, p) => s + p.variantes.length, 0)} variantes, ${piezas} piezas.`)

for (const p of prendas) {
  const total = p.variantes.reduce((t, v) => t + v.existencias, 0)
  const precios = [...new Set(p.variantes.map((v) => v.precio / 100))].map((x) => `$${x.toLocaleString('es-MX')}`).join('/')
  console.log(
    `  ${p.codigo.padEnd(8)}${p.codigoAsignado ? '*' : ' '} ${p.nombre.slice(0, 34).padEnd(34)} ${p.categoria.slice(0, 16).padEnd(16)} ${String(p.variantes.length).padStart(2)} var  ${String(total).padStart(3)} pzs  ${precios}${p.fotos.length ? `  ${p.fotos.length} foto(s)` : ''}`,
  )
}
if (prendas.some((p) => p.codigoAsignado)) console.log('  * código asignado automáticamente')

if (avisos.length) console.log(`\nAvisos (no impiden importar):\n${avisos.join('\n')}`)
if (errores.length) {
  console.log(`\n${errores.length} error(es). No se subió nada:\n${errores.join('\n')}`)
  process.exit(2)
}
if (!DE_VERDAD) {
  console.log('\nTodo bien. No se subió nada: repite con --de-verdad para importar.')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Subir
// ---------------------------------------------------------------------------

let creadas = 0
let actualizadas = 0
let movimientos = 0
let fotosSubidas = 0
const fallos: string[] = []

for (const p of prendas) {
  const usadas = opcionesDe.get(p)!
  const payload = {
    product: {
      name: p.nombre,
      code: p.codigo,
      brand: p.marca,
      short_description: p.descripcionCorta,
      long_description: p.descripcion,
      materials: p.composicion,
      care: p.cuidados,
      status: p.estado,
      is_online: p.enLinea,
      options: usadas.map((o) => ({ name: nombreOpcion(o), values: valoresDe(p, o) })),
    },
    category: p.categoria,
    ...(p.colecciones ? { collections: p.colecciones } : {}),
    variants: p.variantes.map((v) => ({
      // El valor tal como quedó en la opción (respeta mayúsculas de la primera aparición).
      values: usadas.map((o) => valoresDe(p, o).find((x) => sinMarcas(x.value) === sinMarcas(v[o]!))!.value),
      sku: v.sku,
      barcode: v.barcode,
      price_cents: v.precio,
      compare_at_price_cents: v.precioAntes,
      cost_cents: v.costo,
      bin_location: v.ubicacion,
      low_stock_threshold: v.minimo,
      stock: v.existencias,
    })),
  }

  const { data, error: e } = await sb.rpc('importar_prenda', { p_payload: payload })
  if (e) {
    fallos.push(`  ${p.codigo} ${p.nombre} (filas ${p.filas.join(', ')}): ${e.message}`)
    console.log(`  ✗ ${p.codigo} ${p.nombre}: ${e.message}`)
    continue
  }
  const r = data as { id: string; created: boolean; stock_changes: number }
  if (r.created) creadas++
  else actualizadas++
  movimientos += r.stock_changes

  if (p.fotos.length) {
    try {
      fotosSubidas += await subirFotos(r.id, p)
    } catch (err) {
      fallos.push(`  ${p.codigo} ${p.nombre}: fotos — ${(err as Error).message}`)
    }
  }
  console.log(`  ✓ ${p.codigo} ${p.nombre}${r.created ? '' : ' (actualizada)'}`)
}

console.log(`\nListo: ${creadas} prendas nuevas, ${actualizadas} actualizadas, ${movimientos} existencias cargadas, ${fotosSubidas} fotos.`)
if (fallos.length) {
  console.log(`\n${fallos.length} prenda(s) no se pudieron subir:\n${fallos.join('\n')}`)
  process.exit(3)
}

/**
 * Sube las fotos de una prenda: la más larga a 2000 px y en WEBP, como las que
 * sube la tablet. El nombre en Storage sale del archivo, así reimportar la
 * misma foto la reemplaza en vez de duplicarla.
 */
async function subirFotos(productId: string, p: Prenda): Promise<number> {
  const { data: existentes, error: e } = await sb
    .from('product_images')
    .select('storage_path, position')
    .eq('product_id', productId)
  if (e) throw e
  const yaEstan = new Set((existentes ?? []).map((x) => x.storage_path))
  let posicion = Math.max(-1, ...(existentes ?? []).map((x) => x.position)) + 1
  let subidas = 0

  for (const nombre of p.fotos) {
    const origen = rutaFoto(nombre)!
    const imagen = sharp(origen).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
    const { data: cuerpo, info } = await imagen.webp({ quality: 82 }).toBuffer({ resolveWithObject: true })
    const base = sinAcentos(path.parse(nombre).name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'foto'
    const destino = `${productId}/${base}.webp`

    const { error: errSubida } = await sb.storage
      .from('products')
      .upload(destino, cuerpo, { contentType: 'image/webp', upsert: true })
    if (errSubida) throw new Error(`${nombre}: ${errSubida.message}`)

    if (!yaEstan.has(destino)) {
      const { error: errFila } = await sb.from('product_images').insert({
        product_id: productId,
        storage_path: destino,
        alt_text: p.nombre,
        width: info.width,
        height: info.height,
        position: posicion++,
      })
      if (errFila) throw new Error(`${nombre}: ${errFila.message}`)
    }
    subidas++
  }
  return subidas
}
