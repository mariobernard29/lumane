/**
 * Genera la plantilla de Excel para cargar el catálogo y el inventario.
 *
 *   node scripts/catalogo/plantilla.mjs
 *
 * Escribe `plantillas/Plantilla catálogo Lumane.xlsx`. Las categorías y
 * colecciones de las listas desplegables se leen de la base en ese momento
 * (con la llave de servicio de apps/web/.env.local); sin ella, salen las de la
 * siembra.
 */
import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import {
  COLORES,
  COLUMNAS,
  HOJA_CATALOGO,
  HOJA_EJEMPLO,
  HOJA_INSTRUCCIONES,
  HOJA_LISTAS,
  TALLAS,
} from './columnas.mjs'

const RAIZ = path.resolve(import.meta.dirname, '..', '..')
const SALIDA = path.join(RAIZ, 'plantillas', 'Plantilla catálogo Lumane.xlsx')
const FILAS = 1000

const TINTA = 'FF0A0A0A'
const HUESO = 'FFF6F3EE'
const GRIS = 'FFE7E2DA'
const BLANCO = 'FFFFFFFF'

function leerEnv() {
  const env = { ...process.env }
  try {
    for (const l of readFileSync(path.join(RAIZ, 'apps', 'web', '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(l)
      if (m && !env[m[1]]) env[m[1]] = m[2].trim()
    }
  } catch {}
  return env
}

async function listasDeLaBase() {
  const env = leerEnv()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const llave = env.SUPABASE_SECRET_KEY
  const respaldo = {
    categorias: ['Vestidos', 'Sets', 'Pantalones', 'Suéters / cardigans', 'Abrigos', 'Tops / bodies', 'Camisas', 'Shorts y bermudas', 'Bolsos'],
    colecciones: [],
  }
  if (!url || !llave) return respaldo
  const sb = createClient(url, llave, { auth: { persistSession: false } })
  const [cats, cols] = await Promise.all([
    sb.from('categories').select('name').order('position'),
    sb.from('collections').select('name').order('position'),
  ])
  if (cats.error || cols.error) return respaldo
  return { categorias: cats.data.map((c) => c.name), colecciones: cols.data.map((c) => c.name) }
}

/** A1 de una columna (1 → A, 27 → AA). */
function letra(n) {
  let s = ''
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

function encabezados(hoja) {
  hoja.columns = COLUMNAS.map((c) => ({ key: c.clave, width: c.ancho }))
  const fila = hoja.getRow(1)
  COLUMNAS.forEach((c, i) => {
    const celda = fila.getCell(i + 1)
    celda.value = c.obligatoria ? `${c.titulo} *` : c.titulo
    celda.font = { name: 'Arial', bold: true, color: { argb: c.nivel === 'prenda' ? BLANCO : TINTA }, size: 10 }
    // Negro = de la prenda (basta en su primera fila); hueso = de cada talla/color.
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.nivel === 'prenda' ? TINTA : GRIS } }
    celda.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    celda.border = { bottom: { style: 'medium', color: { argb: TINTA } } }
    celda.note = { texts: [{ text: c.nota }] }
  })
  fila.height = 34
  hoja.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }]
  hoja.autoFilter = { from: 'A1', to: `${letra(COLUMNAS.length)}1` }
}

function validaciones(hoja, filas) {
  const rango = (n) => (clave) => {
    const i = COLUMNAS.findIndex((c) => c.clave === clave) + 1
    return `${letra(i)}2:${letra(i)}${n + 1}`
  }
  const r = rango(filas)
  const lista = (formula, estricta, titulo, texto) => ({
    type: 'list',
    allowBlank: true,
    formulae: [formula],
    // No estricta: ofrece la lista pero acepta escribir otra cosa (una talla
    // o una categoría nueva).
    showErrorMessage: estricta,
    errorStyle: 'stop',
    errorTitle: titulo,
    error: texto,
  })

  const listas = {
    categoria: lista(`'${HOJA_LISTAS}'!$A$2:$A$200`, false),
    talla: lista(`'${HOJA_LISTAS}'!$B$2:$B$200`, false),
    color: lista(`'${HOJA_LISTAS}'!$C$2:$C$200`, false),
    colecciones: lista(`'${HOJA_LISTAS}'!$D$2:$D$200`, false),
    en_linea: lista('"Sí,No"', true, 'En tienda en línea', 'Escribe Sí o No.'),
    estado: lista('"Activo,Borrador"', true, 'Estado', 'Escribe Activo o Borrador.'),
  }
  const dinero = {
    type: 'decimal', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0],
    showErrorMessage: true, errorTitle: 'Importe', error: 'Escribe solo el número, en pesos (1290 o 1290.50).',
  }
  const entero = {
    type: 'whole', operator: 'greaterThanOrEqual', allowBlank: true, formulae: [0],
    showErrorMessage: true, errorTitle: 'Piezas', error: 'Escribe un número entero de piezas (0 o más).',
  }

  for (const c of COLUMNAS) {
    const v = listas[c.clave] ?? (c.tipo === 'dinero' ? dinero : c.tipo === 'entero' ? entero : null)
    if (v) hoja.dataValidations.add(r(c.clave), v)
  }

  // Formato de pesos en las columnas de dinero y zebra suave para seguir la fila.
  for (const c of COLUMNAS) {
    if (c.tipo === 'dinero') hoja.getColumn(c.clave).numFmt = '"$"#,##0.00'
    if (c.tipo === 'entero') hoja.getColumn(c.clave).numFmt = '0'
    if (c.clave === 'codigo' || c.clave === 'codigo_barras' || c.clave === 'sku') {
      // Texto: si no, Excel convierte 0012345 en 12345 y el código de barras deja de leerse.
      hoja.getColumn(c.clave).numFmt = '@'
    }
  }
}

const EJEMPLO = [
  { codigo: '1001', nombre: 'Vestido Midi Satinado', categoria: 'Vestidos', talla: 'Chica', color: 'Negro', precio: 1890, costo: 820, existencias: 2, marca: '', descripcion_corta: 'Vestido midi de satín con escote cuadrado.', composicion: 'Poliéster 95%; Elastano 5%', cuidados: 'Lavar a mano con agua fría; No usar secadora', fotos: 'vestido-midi-1.jpg, vestido-midi-2.jpg', en_linea: 'Sí', estado: 'Activo' },
  { codigo: '1001', nombre: 'Vestido Midi Satinado', talla: 'Mediana', color: 'Negro', precio: 1890, costo: 820, existencias: 3 },
  { codigo: '1001', nombre: 'Vestido Midi Satinado', talla: 'Grande', color: 'Negro', precio: 1890, costo: 820, existencias: 1 },
  { codigo: '1001', nombre: 'Vestido Midi Satinado', talla: 'Chica', color: 'Rojo', precio: 1890, costo: 820, existencias: 2 },
  { codigo: '1001', nombre: 'Vestido Midi Satinado', talla: 'Mediana', color: 'Rojo', precio: 1890, costo: 820, existencias: 0 },
  { codigo: '1002', nombre: 'Blazer Lino Camel', categoria: 'Abrigos', talla: 'Unitalla', precio: 2490, precio_antes: 2990, costo: 1100, existencias: 4, descripcion_corta: 'Blazer de lino con botón al frente.', colecciones: 'Básicos Atemporales', en_linea: 'Sí', estado: 'Activo', ubicacion: 'Percha 3' },
  { codigo: '', nombre: 'Bolso Tote Piel', categoria: 'Bolsos', precio: 3200, costo: 1500, existencias: 2, codigo_barras: '7501234567890', en_linea: 'No', estado: 'Activo', minimo: 1 },
]

function instrucciones(libro) {
  const h = libro.addWorksheet(HOJA_INSTRUCCIONES, { properties: { tabColor: { argb: TINTA } } })
  h.getColumn(1).width = 4
  h.getColumn(2).width = 110
  h.views = [{ showGridLines: false }]

  try {
    const logo = libro.addImage({
      filename: path.join(RAIZ, 'logos lumane', 'Lumane_Logotipo-01.png'),
      extension: 'png',
    })
    h.addImage(logo, { tl: { col: 1, row: 0.4 }, ext: { width: 200, height: 73 } })
  } catch {}

  const texto = [
    ['titulo', 'Plantilla de catálogo e inventario'],
    ['', ''],
    ['sub', 'Cómo llenarla'],
    ['', '1. Trabaja en la hoja «Catálogo». La hoja «Ejemplo» muestra tres prendas llenas; no la borres, no se importa.'],
    ['', '2. UNA FILA POR CADA TALLA Y COLOR. Un vestido en Chica, Mediana y Grande, en negro y rojo, son seis filas.'],
    ['', '3. Las filas de una misma prenda llevan el mismo «Código de prenda» y el mismo nombre. Si no usas código, basta con el mismo nombre.'],
    ['', '4. Columnas NEGRAS = datos de la prenda: basta con llenarlas en su primera fila (categoría, descripción, fotos…).'],
    ['', '    Columnas GRISES = datos de cada talla/color: van en todas las filas (precio, existencias…).'],
    ['', '5. Obligatorias (*): Nombre, Categoría (en la primera fila), Precio de venta y Existencias.'],
    ['', '6. Precios en pesos y CON IVA, como se cobran en caja. Sin signo de pesos si te es más fácil: 1290.'],
    ['', '7. SKU y código de barras: déjalos vacíos. El SKU se arma solo (1001-CH-NEG) y es lo que imprime la etiqueta.'],
    ['', '    Pon «Código de barras» solo si la prenda ya trae uno del proveedor y quieres escanear ese.'],
    ['', '8. Pasa el cursor sobre cada encabezado para ver su explicación.'],
    ['', ''],
    ['sub', 'Fotos (opcional)'],
    ['', 'Escribe en «Fotos» los nombres de archivo separados por coma y mándame las fotos en una carpeta junto con el Excel.'],
    ['', 'La primera es la portada. Pueden ser JPG, PNG o WEBP; se reducen y optimizan solas.'],
    ['', ''],
    ['sub', 'Qué pasa al importar'],
    ['', '• Primero se revisa el archivo completo y se te dice fila por fila lo que esté mal. No se sube nada hasta que esté todo bien.'],
    ['', '• Las existencias se FIJAN, no se suman: si corriges el archivo y se vuelve a importar, no se duplica el inventario.'],
    ['', '• Cada carga queda en el historial de inventario como «Carga del catálogo desde Excel».'],
    ['', '• Una prenda que ya existe (mismo código) se actualiza; no se crea otra.'],
  ]

  let fila = 6
  for (const [tipo, t] of texto) {
    const c = h.getCell(fila, 2)
    c.value = t
    c.alignment = { wrapText: true, vertical: 'top' }
    c.font =
      tipo === 'titulo'
        ? { name: 'Georgia', size: 20, color: { argb: TINTA } }
        : tipo === 'sub'
          ? { name: 'Arial', size: 11, bold: true, color: { argb: TINTA } }
          : { name: 'Arial', size: 10, color: { argb: 'FF333333' } }
    if (tipo === 'sub') {
      c.border = { bottom: { style: 'thin', color: { argb: TINTA } } }
    }
    fila++
  }
}

function listasOcultas(libro, { categorias, colecciones }) {
  const h = libro.addWorksheet(HOJA_LISTAS, { state: 'hidden' })
  const columnas = [
    ['Categorías', categorias],
    ['Tallas', TALLAS],
    ['Colores', COLORES],
    ['Colecciones', colecciones],
  ]
  columnas.forEach(([titulo, valores], i) => {
    h.getCell(1, i + 1).value = titulo
    valores.forEach((v, j) => (h.getCell(j + 2, i + 1).value = v))
  })
}

const listas = await listasDeLaBase()
const libro = new ExcelJS.Workbook()
libro.creator = 'Lumane'
libro.created = new Date()

instrucciones(libro)

const catalogo = libro.addWorksheet(HOJA_CATALOGO, { properties: { tabColor: { argb: 'FFB08D57' } } })
encabezados(catalogo)
validaciones(catalogo, FILAS)

const ejemplo = libro.addWorksheet(HOJA_EJEMPLO)
encabezados(ejemplo)
validaciones(ejemplo, EJEMPLO.length)
for (const fila of EJEMPLO) ejemplo.addRow(fila)
ejemplo.eachRow((row, n) => {
  if (n === 1) return
  row.eachCell({ includeEmpty: true }, (c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HUESO } }
    c.font = { name: 'Arial', size: 10, color: { argb: 'FF555555' } }
  })
})

listasOcultas(libro, listas)
libro.views = [{ activeTab: 1 }]

mkdirSync(path.dirname(SALIDA), { recursive: true })
await libro.xlsx.writeFile(SALIDA)
console.log(`Plantilla: ${path.relative(RAIZ, SALIDA)}`)
console.log(`  ${listas.categorias.length} categorías, ${listas.colecciones.length} colecciones en las listas`)
