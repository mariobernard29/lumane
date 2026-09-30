/**
 * Sube las fotos del local a Storage y las da de alta en la galería.
 *
 * La propietaria las dejó en `logos lumane/` en vez de subirlas por el panel,
 * que es lo razonable cuando las acabas de pasar del teléfono. Esto hace lo
 * mismo que haría `/admin/boutique`: mete el archivo en el bucket `content` y
 * crea su fila en `hero_slides` con `page_key = 'boutique'`.
 *
 *   node --experimental-strip-types scripts/subir-fotos-boutique.ts --de-verdad
 *
 * Sin `--de-verdad` solo dice qué haría.
 *
 * **Es idempotente por nombre de archivo.** La ruta en Storage se deriva del
 * nombre original, así que volver a correrlo sobrescribe el mismo objeto y no
 * duplica la fila. Sin eso, tres ejecuciones dejarían seis fotos repetidas en
 * la página y habría que limpiarlas a mano.
 *
 * Llave de servicio porque no hay sesión de navegador de la que sacar un
 * usuario, y las políticas de `storage.objects` exigen `cms.write`.
 */
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const RAIZ = path.resolve(import.meta.dirname, '..')
const DE_VERDAD = process.argv.includes('--de-verdad')

// Las variables viven en el .env de la web: es el único paquete que habla con
// Supabase con llave de servicio, y duplicarlas en la raíz daría dos sitios
// donde rotar la misma llave.
process.loadEnvFile(path.join(RAIZ, 'apps', 'web', '.env.local'))

function env(nombre: string): string {
  const valor = process.env[nombre]
  if (!valor) throw new Error(`Falta ${nombre} en apps/web/.env.local`)
  return valor
}

const supabase = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SECRET_KEY'), {
  auth: { persistSession: false },
})

/**
 * Qué se sube y con qué texto alternativo.
 *
 * El `alt` lo escribe una persona, no el script: es lo que lee quien no ve la
 * foto, y «local1.jpg» no le dice nada. Son dos; describirlas a mano cuesta
 * menos que cualquier automatismo.
 */
const FOTOS = [
  {
    archivo: 'local1.jpg',
    alt:
      'Fachada de la boutique Lumane: el letrero negro sobre la entrada, un toldo beige y el ' +
      'escaparate de cristal con maniquíes vestidos. Al pie del cristal, un arriate de grava con cactus.',
    pie: 'Así se ve desde la calle.' as string | null,
  },
  {
    archivo: 'local2.jpg',
    alt:
      'Interior de la boutique: el mostrador de tela clara con el monograma de Lumane al frente, el ' +
      'logotipo retroiluminado en la pared y dos bolsas de la tienda sobre la barra, junto a una orquídea.',
    pie: 'El mostrador, donde se recogen los pedidos en línea.' as string | null,
  },
]

const CARPETA = path.join(RAIZ, 'logos lumane')

async function main() {
  console.log(DE_VERDAD ? 'Subiendo…\n' : 'Ensayo. Añade --de-verdad para ejecutar.\n')

  const { data: existentes } = await supabase
    .from('hero_slides')
    .select('id, image_path, position')
    .eq('page_key', 'boutique')

  let posicion = Math.max(0, ...(existentes ?? []).map((f) => f.position ?? 0))

  for (const foto of FOTOS) {
    const origen = path.join(CARPETA, foto.archivo)
    const destino = `boutique/${foto.archivo}`

    const bytes = await readFile(origen)
    const yaEsta = (existentes ?? []).find((f) => f.image_path === destino)

    console.log(`${foto.archivo} → ${destino} (${Math.round(bytes.byteLength / 1024)} KB)`)
    if (yaEsta) console.log('   ya tenía fila; se reemplaza el archivo y se deja la fila')

    if (!DE_VERDAD) continue

    const { error: fallo } = await supabase.storage
      .from('content')
      .upload(destino, bytes, { contentType: 'image/jpeg', upsert: true })

    if (fallo) throw new Error(`subiendo ${foto.archivo}: ${fallo.message}`)

    if (yaEsta) {
      const { error } = await supabase
        .from('hero_slides')
        .update({ image_alt: foto.alt, subtitle: foto.pie })
        .eq('id', yaEsta.id)
      if (error) throw new Error(`actualizando ${foto.archivo}: ${error.message}`)
    } else {
      posicion += 1
      const { error } = await supabase.from('hero_slides').insert({
        page_key: 'boutique',
        image_path: destino,
        image_alt: foto.alt,
        subtitle: foto.pie,
        position: posicion,
        is_active: true,
      })
      if (error) throw new Error(`dando de alta ${foto.archivo}: ${error.message}`)
    }

    console.log('   ✓ listo')
  }

  console.log('\nRevisa https://lumane.mx/p/la-boutique (o localhost:3000).')
}

await main()
