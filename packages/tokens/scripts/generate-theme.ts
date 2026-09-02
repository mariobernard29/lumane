/**
 * Genera `theme.css` — el bloque `@theme` de Tailwind v4 que consume `apps/web`.
 *
 * Los tokens de `src/` son la única fuente de verdad; este archivo es un
 * artefacto derivado. Nunca editar `theme.css` a mano: correr `pnpm build:css`.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { colors } from '../src/colors.ts'
import { fontFamilies, fontSizes } from '../src/typography.ts'
import { spacing, radii, motion } from '../src/layout.ts'

const lines: string[] = [
  '/* Generado por packages/tokens/scripts/generate-theme.ts — no editar a mano. */',
  '',
  '@theme {',
  '  /* ===== Color ===== */',
]

for (const [name, value] of Object.entries(colors)) {
  lines.push(`  --color-${name}: ${value};`)
}

lines.push(
  '',
  '  /* ===== Tipografía (familias) =====',
  '     La primera familia de cada pila se emite como',
  '       var(--font-<slug>, "Nombre Real")',
  '     para que `next/font` pueda inyectar su nombre generado (self-hosted, sin',
  '     petición a Google ni salto de layout) sin que estos tokens dejen de',
  '     funcionar en un entorno que cargue la fuente por su nombre normal —el',
  '     POS, o el prototipo abierto directamente en el navegador. */',
)
const slug = (family: string) => family.toLowerCase().replace(/\s+/g, '-')
for (const [name, stack] of Object.entries(fontFamilies)) {
  const [primary, ...fallbacks] = stack
  const quote = (f: string) => (f.includes(' ') ? `"${f}"` : f)
  const head = `var(--font-${slug(primary!)}, ${quote(primary!)})`
  lines.push(`  --font-${name}: ${[head, ...fallbacks.map(quote)].join(', ')};`)
}

lines.push('', '  /* ===== Tipografía (escala) ===== */')
for (const [name, token] of Object.entries(fontSizes)) {
  lines.push(`  --text-${name}: ${token.size};`)
  lines.push(`  --text-${name}--line-height: ${token.lineHeight};`)
  if ('letterSpacing' in token && token.letterSpacing) {
    lines.push(`  --text-${name}--letter-spacing: ${token.letterSpacing};`)
  }
  lines.push(`  --text-${name}--font-weight: ${token.fontWeight};`)
}

lines.push('', '  /* ===== Espaciado ===== */')
for (const [name, value] of Object.entries(spacing)) {
  lines.push(`  --spacing-${name}: ${value};`)
}

lines.push(
  '',
  '  /* ===== Radios: el sistema es de esquina viva ===== */',
  '  /* Se anulan TODOS los radios del tema por defecto de Tailwind.',
  '     `rounded-full` es una utilidad estática y sobrevive. */',
)
for (const key of ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl']) {
  lines.push(`  --radius-${key}: ${radii.DEFAULT};`)
}

lines.push(
  '',
  '  /* ===== Movimiento: una sola curva en todo el proyecto ===== */',
  `  --ease-lumane: ${motion.easing};`,
)

lines.push('}', '')

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'theme.css')
writeFileSync(out, lines.join('\n'), 'utf8')
console.log(`theme.css generado: ${Object.keys(colors).length} colores, ${Object.keys(fontSizes).length} roles tipográficos`)
