/**
 * Tipografía "Variante F" del prototipo: Instrument Serif para display,
 * Figtree para texto, navegación, etiquetas y precios.
 *
 * El prototipo usa un sistema PAREADO: cada rol tiene una `fontFamily` y un
 * `fontSize` con el mismo nombre, y siempre se aplican juntos
 * (`class="font-display-xl text-display-xl"`). Se conserva tal cual para que
 * el marcado portado sea legible junto al HTML original.
 */

export const fontStacks = {
  display: ['Instrument Serif', 'Georgia', 'serif'],
  text: ['Figtree', 'Helvetica Neue', 'sans-serif'],
} as const

/** Rol tipográfico → familia que le corresponde. */
export const fontFamilies = {
  'display-xl': fontStacks.display,
  'display-xl-mobile': fontStacks.display,
  'headline-lg': fontStacks.display,
  'headline-lg-mobile': fontStacks.display,
  'headline-md': fontStacks.display,
  'headline-sm': fontStacks.display,
  quote: fontStacks.display,
  'body-lg': fontStacks.text,
  'body-md': fontStacks.text,
  'nav-link': fontStacks.text,
  'label-upper': fontStacks.text,
  price: fontStacks.text,
} as const

export interface FontSizeToken {
  size: string
  lineHeight: string
  letterSpacing?: string
  fontWeight: string
}

/**
 * Escala tipográfica. El responsive es MANUAL (par mobile/desktop), nunca
 * `clamp()`: el prototipo alterna con `md:` entre el token `-mobile` y el base.
 */
export const fontSizes = {
  'display-xl': { size: '112px', lineHeight: '0.9', letterSpacing: '-0.035em', fontWeight: '400' },
  'display-xl-mobile': { size: '46px', lineHeight: '0.98', letterSpacing: '-0.02em', fontWeight: '400' },
  'headline-lg': { size: '56px', lineHeight: '1.06', letterSpacing: '-0.02em', fontWeight: '400' },
  'headline-lg-mobile': { size: '32px', lineHeight: '1.15', letterSpacing: '-0.01em', fontWeight: '400' },
  'headline-md': { size: '28px', lineHeight: '1.2', fontWeight: '400' },
  'headline-sm': { size: '20px', lineHeight: '1.35', fontWeight: '400' },
  quote: { size: '22px', lineHeight: '1.45', fontWeight: '400' },
  'body-lg': { size: '19px', lineHeight: '1.6', fontWeight: '400' },
  'body-md': { size: '16px', lineHeight: '1.65', fontWeight: '400' },
  'nav-link': { size: '13px', lineHeight: '1', letterSpacing: '0.09em', fontWeight: '500' },
  'label-upper': { size: '11px', lineHeight: '16px', letterSpacing: '0.16em', fontWeight: '700' },
  price: { size: '15px', lineHeight: '1', letterSpacing: '0.02em', fontWeight: '500' },
} as const satisfies Record<keyof typeof fontFamilies, FontSizeToken>

export type TypographyToken = keyof typeof fontSizes
