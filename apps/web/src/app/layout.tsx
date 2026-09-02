import type { Metadata, Viewport } from 'next'
import { Figtree, Instrument_Serif } from 'next/font/google'
import localFont from 'next/font/local'
import { NoiseOverlay, TouchReveal } from '@lumane/ui-web'

import './globals.css'

/**
 * Tipografía "Variante F" del prototipo. `next/font` la descarga en tiempo de
 * build y la sirve desde el propio dominio: sin petición a Google en runtime,
 * sin salto de layout y sin depender de un tercero para que la marca se vea
 * como debe.
 *
 * Cada fuente expone una variable CSS que los tokens de `@lumane/tokens`
 * consumen con `var(--font-…, "Nombre Real")`.
 */
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
  display: 'swap',
})

const figtree = Figtree({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-figtree',
  display: 'swap',
})

/**
 * Material Symbols Outlined, auto-alojada.
 *
 * `next/font/google` no incluye fuentes de iconos, así que el archivo se
 * descargó SUBSETEADO a los ~30 glifos que usa el diseño: 10 KB en lugar de
 * los 3.9 MB del set completo. Para añadir un icono nuevo hay que regenerar el
 * subconjunto (ver `docs/adr/0002-iconos.md`).
 *
 * `display: 'block'` evita el destello de ligaduras crudas: sin él, mientras
 * carga se leería literalmente "arrow_forward" en pantalla.
 */
const materialSymbols = localFont({
  src: './fonts/material-symbols-outlined.woff2',
  weight: '100 700',
  variable: '--font-material-symbols',
  display: 'block',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'LUMANE · Boutique de moda femenina',
    template: '%s · LUMANE',
  },
  description: 'Boutique de moda femenina. Piezas de autor, en series cortas.',
  icons: { icon: '/icon-lumane.png' },
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  colorScheme: 'light',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es-MX"
      className={`${instrumentSerif.variable} ${figtree.variable} ${materialSymbols.variable}`}
    >
      <body className="bg-surface text-primary antialiased">
        <NoiseOverlay />
        <TouchReveal />
        {children}
      </body>
    </html>
  )
}
