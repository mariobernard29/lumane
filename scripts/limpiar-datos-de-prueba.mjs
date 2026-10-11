/**
 * Deja la base lista para el catálogo real: borra los productos, las ventas y
 * todo lo que generaron las pruebas.
 *
 * ES DE UN SOLO USO, antes de abrir. Borra:
 *   - productos (y en cascada: opciones, variantes, fotos, existencias,
 *     categorías y colecciones a las que pertenecían) y sus archivos en Storage
 *   - pedidos del POS y en línea (y en cascada: líneas, pagos, eventos, envíos)
 *   - el libro de movimientos de inventario, reservas, devoluciones
 *   - turnos de caja, carritos, cotizaciones de envío, correos en cola, reseñas
 *   - clientas SIN cuenta (las que tienen cuenta en la tienda se quedan: borrar
 *     la fila dejaría a esa cuenta sin perfil de clienta)
 *
 * NO toca: categorías, colecciones, portada, páginas, ajustes, personal.
 *
 * Primero respalda todo a `respaldos/<fecha>/` (ignorado por git), luego borra.
 *
 *   node scripts/limpiar-datos-de-prueba.mjs              # solo cuenta
 *   node scripts/limpiar-datos-de-prueba.mjs --de-verdad  # respalda y borra
 *
 * El libro de inventario es inmutable por diseño (trigger
 * `inventory_movements_immutable`): ningún RPC ni la llave de servicio pueden
 * borrarlo. Por eso el borrado de la base va en `limpiar-datos-de-prueba.sql`,
 * que apaga el trigger SOLO dentro de su transacción y se pega en Supabase →
 * SQL Editor. Este script respalda y borra las fotos de Storage, que el SQL no
 * puede tocar.
 */
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const RAIZ = path.resolve(import.meta.dirname, '..')
const DE_VERDAD = process.argv.includes('--de-verdad')

function leerEnv() {
  const archivo = path.join(RAIZ, 'apps', 'web', '.env.local')
  const env = { ...process.env }
  try {
    for (const l of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(l)
      if (m && !env[m[1]]) env[m[1]] = m[2].trim()
    }
  } catch {}
  return env
}

const env = leerEnv()
const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL
const llave = env.SUPABASE_SECRET_KEY
if (!url || !llave) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY en apps/web/.env.local')

const sb = createClient(url, llave, { auth: { persistSession: false } })

const TABLAS = [
  'products', 'product_options', 'product_option_values', 'product_variants', 'variant_option_values',
  'product_images', 'product_categories', 'product_collections', 'product_tags', 'product_relations',
  'product_reviews', 'inventory_levels', 'inventory_movements', 'inventory_reservations',
  'orders', 'order_lines', 'payments', 'order_status_events', 'shipments', 'returns', 'return_lines',
  'coupon_redemptions', 'register_sessions', 'cash_movements', 'customers', 'customer_addresses',
  'carts', 'cart_lines', 'shipping_quotes', 'outbox_events',
]

async function todas(tabla) {
  const filas = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.from(tabla).select('*').range(desde, desde + 999)
    if (error) throw new Error(`${tabla}: ${error.message}`)
    filas.push(...data)
    if (data.length < 1000) return filas
  }
}

const base = {}
for (const t of TABLAS) base[t] = await todas(t)
for (const t of TABLAS) if (base[t].length) console.log(`${t.padEnd(24)} ${base[t].length}`)

if (!DE_VERDAD) {
  console.log('\nNo se borró nada. Repite con --de-verdad para respaldar y borrar.')
  process.exit(0)
}

// --- Respaldo -------------------------------------------------------------
const carpeta = path.join(RAIZ, 'respaldos', `${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}-limpieza`)
mkdirSync(path.join(carpeta, 'fotos'), { recursive: true })
writeFileSync(path.join(carpeta, 'base.json'), JSON.stringify(base, null, 1))
for (const img of base.product_images) {
  const { data, error } = await sb.storage.from('products').download(img.storage_path)
  if (error) {
    console.warn(`  foto sin respaldar: ${img.storage_path} (${error.message})`)
    continue
  }
  writeFileSync(path.join(carpeta, 'fotos', img.storage_path.replaceAll('/', '__')), Buffer.from(await data.arrayBuffer()))
}
console.log(`\nRespaldo en ${path.relative(RAIZ, carpeta)}`)

// --- Fotos en Storage -----------------------------------------------------
// Se listan las carpetas del bucket, no solo las rutas de product_images: una
// foto subida y luego quitada de la prenda deja su archivo huérfano.
const productos = new Set(base.products.map((p) => p.id))
const { data: carpetas, error: errLista } = await sb.storage.from('products').list('', { limit: 1000 })
if (errLista) throw errLista
const rutas = []
for (const c of carpetas ?? []) {
  if (!productos.has(c.name)) continue
  const { data: archivos } = await sb.storage.from('products').list(c.name, { limit: 1000 })
  for (const a of archivos ?? []) rutas.push(`${c.name}/${a.name}`)
}
if (rutas.length) {
  const { error } = await sb.storage.from('products').remove(rutas)
  if (error) throw error
}
console.log(`Fotos borradas de Storage: ${rutas.length}`)

// --- Base -----------------------------------------------------------------
// El borrado de la base va aparte, en SQL: ver la cabecera de este archivo.
console.log('\nAhora ejecuta scripts/limpiar-datos-de-prueba.sql en Supabase → SQL Editor.')
