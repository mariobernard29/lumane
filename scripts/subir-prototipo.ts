/**
 * Sube a Supabase Storage las imágenes que todavía viven en
 * `apps/web/public/prototipo/` y apunta las columnas de la base a su nueva
 * ruta.
 *
 * ES DE UN SOLO USO. Cuando termine y la carpeta se borre, este archivo
 * también puede irse. No se convierte en una migración porque una migración
 * mueve datos dentro de Postgres, y esto mueve bytes a otro servicio: el día
 * que alguien recree la base desde cero, las imágenes ya estarán en Storage y
 * la siembra apuntará ahí.
 *
 * POR QUÉ UNA COPIA POR FILA, aunque el mismo archivo esté referenciado tres
 * veces. Si dos categorías compartieran objeto, cambiar la foto de una
 * cambiaría la de la otra sin que nadie lo relacione. Son doce archivos de
 * menos de un mega: duplicar bytes es más barato que esa sorpresa.
 *
 * POR QUÉ LLAVE DE SERVICIO. Es un script de mantenimiento sin sesión de
 * navegador; no hay cookies de las que sacar un usuario. Las políticas de
 * `storage.objects` exigen `inventory.write` o `cms.write`, que solo tiene una
 * persona autenticada.
 *
 *   node --experimental-strip-types scripts/subir-prototipo.ts --de-verdad
 *
 * Sin `--de-verdad` solo dice qué haría. Es idempotente: una ruta que ya no
 * empieza por `/prototipo/` se salta.
 */
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const RAIZ = path.resolve(import.meta.dirname, '..')
const CARPETA = path.join(RAIZ, 'apps', 'web', 'public', 'prototipo')
const PREFIJO = '/prototipo/'
const DE_VERDAD = process.argv.includes('--de-verdad')

function env(nombre: string): string {
  const valor = process.env[nombre]
  if (!valor) throw new Error(`Falta ${nombre} en el entorno`)
  return valor
}

const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), {
  auth: { persistSession: false },
})

const TIPOS: Record<string, string> = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
}

let subidas = 0
let saltadas = 0
const fallos: string[] = []

/** Sube el archivo local que hay detrás de una ruta `/prototipo/...`. */
async function subir(rutaVieja: string, bucket: string, carpeta: string): Promise<string | null> {
  if (!rutaVieja.startsWith(PREFIJO)) {
    saltadas++
    return null
  }

  const nombre = rutaVieja.slice(PREFIJO.length)
  const extension = path.extname(nombre).toLowerCase()
  const tipo = TIPOS[extension]
  if (!tipo) {
    fallos.push(`${nombre}: extensión no admitida`)
    return null
  }

  // Nombre nuevo con uuid, igual que hace el panel: evita colisiones y caché
  // envenenada cuando una foto se reemplaza.
  const destino = `${carpeta}/${randomUUID()}${extension}`

  if (!DE_VERDAD) {
    console.log(`  [ensayo] ${nombre} → ${bucket}/${destino}`)
    subidas++
    return destino
  }

  try {
    const bytes = await readFile(path.join(CARPETA, nombre))
    const { error } = await supabase.storage
      .from(bucket)
      .upload(destino, bytes, { contentType: tipo, upsert: false })
    if (error) throw new Error(error.message)

    console.log(`  ✓ ${nombre} → ${bucket}/${destino}`)
    subidas++
    return destino
  } catch (e) {
    fallos.push(`${nombre}: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

/** Una columna de texto con una ruta dentro. */
async function migrarColumna(
  tabla: string,
  columna: string,
  bucket: string,
  carpeta: string,
  claveCarpeta?: string,
) {
  console.log(`\n${tabla}.${columna}`)

  const { data, error } = await supabase
    .from(tabla)
    .select(`id, ${columna}${claveCarpeta ? `, ${claveCarpeta}` : ''}`)
    .like(columna, `${PREFIJO}%`)

  if (error) {
    fallos.push(`${tabla}.${columna}: ${error.message}`)
    return
  }
  if (!data || data.length === 0) {
    console.log('  (nada que migrar)')
    return
  }

  for (const fila of data as Record<string, string>[]) {
    // `carpeta` vacía + clave significa «la carpeta ES el valor de la clave»,
    // que es el caso de las fotos de producto: van bajo su product_id.
    const sub = claveCarpeta
      ? [carpeta, fila[claveCarpeta]].filter(Boolean).join('/')
      : carpeta
    const nueva = await subir(fila[columna]!, bucket, sub)
    if (!nueva || !DE_VERDAD) continue

    const { error: eUpdate } = await supabase
      .from(tabla)
      .update({ [columna]: nueva })
      .eq('id', fila.id!)

    if (eUpdate) fallos.push(`${tabla}#${fila.id}: ${eUpdate.message}`)
  }
}

/** `page_sections.config.images[].path`, que vive dentro de un jsonb. */
async function migrarSecciones() {
  console.log('\npage_sections.config.images')

  const { data, error } = await supabase
    .from('page_sections')
    .select('id, page_key, config')
    .not('config->images', 'is', null)

  if (error) {
    fallos.push(`page_sections: ${error.message}`)
    return
  }

  for (const fila of data ?? []) {
    const config = (fila.config ?? {}) as { images?: { path: string; alt: string }[] }
    if (!Array.isArray(config.images) || config.images.length === 0) continue

    let cambiado = false
    const imagenes = []
    for (const img of config.images) {
      const nueva = await subir(img.path, 'content', fila.page_key)
      if (nueva && DE_VERDAD) {
        imagenes.push({ ...img, path: nueva })
        cambiado = true
      } else {
        imagenes.push(img)
      }
    }

    if (!cambiado) continue
    const { error: eUpdate } = await supabase
      .from('page_sections')
      .update({ config: { ...config, images: imagenes } })
      .eq('id', fila.id)

    if (eUpdate) fallos.push(`page_sections#${fila.id}: ${eUpdate.message}`)
  }
}

async function main() {
  console.log(
    DE_VERDAD
      ? 'Subiendo de verdad. Las columnas se van a actualizar.'
      : 'ENSAYO. No se sube ni se cambia nada. Añade --de-verdad para hacerlo.',
  )

  // Las fotos de producto van al bucket `products`, en la carpeta de SU
  // producto: es la convención que `productImagePath` ya define.
  await migrarColumna('product_images', 'storage_path', 'products', '', 'product_id')
  await migrarColumna('categories', 'image_path', 'content', 'categorias')
  await migrarColumna('collections', 'image_path', 'content', 'colecciones')
  await migrarColumna('collections', 'banner_path', 'content', 'colecciones')
  await migrarColumna('hero_slides', 'image_path', 'content', 'home')
  await migrarColumna('hero_slides', 'mobile_image_path', 'content', 'home')
  await migrarColumna('banners', 'image_path', 'content', 'banners')
  await migrarSecciones()

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`subidas: ${subidas}   ya migradas: ${saltadas}   fallos: ${fallos.length}`)
  for (const f of fallos) console.log(`  ✗ ${f}`)

  if (fallos.length > 0) process.exitCode = 1
  else if (DE_VERDAD) {
    console.log('\nAhora ya se puede borrar apps/web/public/prototipo/ y quitar')
    console.log('«prototipo» del matcher de apps/web/src/proxy.ts.')
  }
}

await main()
