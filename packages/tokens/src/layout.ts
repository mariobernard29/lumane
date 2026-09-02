/**
 * Espaciado, radios y movimiento — valores exactos del prototipo.
 */

export const spacing = {
  /** Padding lateral de TODA sección: `px-5 sm:px-margin-edge`. */
  'margin-edge': '4vw',
  /** Gap del grid maestro de 12 columnas. */
  'col-gap': '32px',
  /** Alto total del header sticky: 64px (fila 1) + 44px (nav) = 108px. */
  'header-h': '108px',
  'section-v-sm': '48px',
  'section-v-md': '80px',
  'section-v-lg': '128px',
} as const

/**
 * El sistema es de esquina viva. Solo sobrevive `full` (badge del carrito,
 * swatches de color, avatar de cuenta).
 */
export const radii = {
  DEFAULT: '0',
  lg: '0',
  xl: '0',
  full: '9999px',
} as const

/**
 * Una sola curva de easing en todo el proyecto: es la firma de movimiento
 * de Lumane. No introducir otras.
 */
export const motion = {
  easing: 'cubic-bezier(.2,.7,.2,1)',
  duration: {
    /** `.nav-item::after` — subrayado de navegación. */
    navUnderline: '.3s',
    /** `.p-media` — grayscale → color. */
    cardColor: '.7s',
    /** `.p-media` — scale(1.04). */
    cardZoom: '.9s',
    /** `.p-caption` — entrada del pie de tarjeta. */
    cardCaption: '.45s',
    /** `.p-rule` — regla blanca que se dibuja (con delay .1s). */
    cardRule: '.55s',
    /** `.tile-media` — scale(1.06) de mosaicos. */
    tileZoom: '.8s',
    /** `@keyframes heroReveal` en la portada. */
    heroReveal: '1.9s',
  },
} as const

/** Relaciones de aspecto recurrentes en el prototipo. */
export const aspects = {
  /** Tarjeta de producto y mosaico de categoría. */
  card: '3/4',
  /** Miniaturas de la galería de producto y cards de colección. */
  thumb: '4/5',
} as const
