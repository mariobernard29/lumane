#!/usr/bin/env node
/**
 * Regenera `packages/db/src/database.types.ts` desde el esquema de Supabase.
 *
 * Existe por un accidente concreto. El script era una sola línea:
 *
 *     supabase gen types typescript --project-id … > packages/db/src/database.types.ts
 *
 * y la redirección del shell **vacía el archivo antes de ejecutar el comando**.
 * Cuando el CLI falló por falta de token, los 100 KB de tipos quedaron en cero
 * bytes — con typecheck roto en los siete paquetes y sin ninguna pista de por
 * qué, porque el error que se ve es «falta el token», no «te borré los tipos».
 *
 * `gen types` no tiene flag de archivo de salida, así que la redirección es
 * inevitable. Lo que sí se puede es redirigir a un temporal y mover solo si
 * todo salió bien, que es lo que hace esto.
 *
 * Se escribe en Node y no en el `package.json` porque el pnpm de Windows corre
 * los scripts con `cmd.exe`, donde no hay `mv` ni `&&` con la semántica que
 * haría falta. Así funciona igual en las dos plataformas.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const DESTINO = join(RAIZ, 'packages', 'db', 'src', 'database.types.ts')
const PROYECTO = 'izyoixhffjjodzizkbqk'

/** Lo mínimo que debe contener una generación buena. */
const SEÑAL = 'export type Database'

const temporal = mkdtempSync(join(tmpdir(), 'lumane-tipos-'))

try {
  const resultado = spawnSync(
    'npx',
    ['--yes', 'supabase@latest', 'gen', 'types', 'typescript', '--project-id', PROYECTO, '--schema', 'public'],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      // `shell` es obligatorio en Windows: `npx` es un `.cmd`, y desde Node 20
      // lanzar archivos de lote sin shell falla con `EINVAL`. Los argumentos
      // son fijos y sin espacios, así que no hay nada que citar ni que
      // alguien pueda inyectar.
      shell: process.platform === 'win32',
    },
  )

  if (resultado.error) throw resultado.error

  if (resultado.status !== 0) {
    process.stderr.write(resultado.stderr || '')
    console.error(
      '\nNo se regeneraron los tipos y el archivo anterior SIGUE INTACTO.\n' +
        'Si el error es de token: corre `supabase login`, o exporta SUPABASE_ACCESS_TOKEN.',
    )
    process.exit(resultado.status ?? 1)
  }

  const generado = resultado.stdout

  // El CLI devuelve su error como JSON en stdout con código 0 en algunos
  // casos. Sin esta comprobación se escribiría un archivo sintácticamente
  // válido y completamente inútil.
  if (!generado.includes(SEÑAL)) {
    console.error(
      'El CLI salió bien pero no devolvió tipos. No se tocó el archivo.\n' +
        `Primeros 200 caracteres:\n${generado.slice(0, 200)}`,
    )
    process.exit(1)
  }

  const intermedio = join(temporal, 'database.types.ts')
  writeFileSync(intermedio, generado, 'utf8')

  let antes = 0
  try {
    antes = readFileSync(DESTINO, 'utf8').length
  } catch {
    // Todavía no existía: es la primera generación.
  }

  renameSync(intermedio, DESTINO)
  console.log(`Tipos regenerados · ${antes} → ${generado.length} bytes`)
} finally {
  rmSync(temporal, { recursive: true, force: true })
}
