/**
 * Copia los tipos generados por el MCP de Supabase a `packages/db`.
 *
 * El flujo normal es `pnpm db:types` con el CLI de Supabase. Este script cubre
 * el caso en que el CLI no está instalado y los tipos llegan como un JSON
 * `{ "types": "..." }` desde la herramienta MCP.
 *
 *   node scripts/sync-types.mjs <ruta-al-json>
 */
import { readFileSync, writeFileSync } from 'node:fs'

const source = process.argv[2]
if (!source) {
  console.error('Uso: node scripts/sync-types.mjs <ruta-al-json>')
  process.exit(1)
}

const { types } = JSON.parse(readFileSync(source, 'utf8'))
const header =
  '// Generado desde el esquema de Supabase. No editar a mano.\n' +
  '// Regenerar tras CADA migracion, o el editor creera que las columnas nuevas no existen.\n\n'

writeFileSync('packages/db/src/database.types.ts', header + types, 'utf8')
console.log(`database.types.ts actualizado (${types.length} bytes)`)
