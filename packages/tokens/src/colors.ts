/**
 * Paleta de Lumane — portada 1:1 del `tailwind.config` inline del prototipo
 * (`prototipo/index.html`, bloque `<script id="tailwind-config">`).
 *
 * No reinterpretar ningún valor: el prototipo es la fuente de verdad visual.
 */
export const colors = {
  /** Negro editorial: bloques oscuros, footer y marco de la foto de producto. */
  'editorial-ink': '#0A0A0A',
  /** Blanco puro: header, tarjetas, botón claro del hero. */
  'paper-bright': '#FFFFFF',
  /** Fondo global de la página (`<body class="bg-surface">`). */
  surface: '#F9F9F9',
  /** Gris papel: swatch "Crudo". */
  'vellum-neutral': '#F2F2F2',
  'surface-container': '#EEEEEE',
  /** Divisores y bordes de separación. */
  'surface-variant': '#E2E2E2',
  /** Texto base y todos los bordes estructurales. */
  primary: '#000000',
  'on-primary': '#FFFFFF',
  tertiary: '#000000',
  'on-tertiary': '#FFFFFF',
  /** Párrafos y enlaces de navegación inactivos. */
  secondary: '#5D5F5F',
  /** Texto terciario: conteos, notas al pie, fechas. */
  'text-muted': '#6B6B68',
  /** Borde de swatches y texto de talla agotada. */
  outline: '#7E7576',
  /** Borde suave: botones inactivos, paginación, placeholders. */
  'outline-variant': '#CFC4C5',
  'on-primary-container': '#848484',
  /** Bordes sobre superficies oscuras (footer, input del boletín). */
  'on-primary-fixed-variant': '#474747',
  /**
   * Acento de la marca. El prototipo lo tiene deliberadamente neutralizado a
   * negro: la identidad es monocroma. Cambiar SOLO este valor tiñe badges,
   * estrellas, numeración de secciones y hovers de forma coherente.
   */
  'accent-red': '#000000',
} as const

export type ColorToken = keyof typeof colors
