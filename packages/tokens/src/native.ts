/**
 * Los mismos tokens, en las unidades que entiende React Native.
 *
 * La web y el POS comparten UN sistema de diseño, pero no comparten motor de
 * estilos: Tailwind consume cadenas CSS (`'112px'`, `'4vw'`, `'1.65'`) y React
 * Native quiere números en puntos densidad-independientes. Este archivo hace
 * esa conversión en un solo sitio, en vez de repetir "16" por toda la tablet.
 *
 * Dos cosas cambian a propósito, y solo dos:
 *
 * 1. **La escala tipográfica.** El display de 112px del escritorio no tiene
 *    sentido en una pantalla que se usa a 40 cm; el POS usa la escala móvil
 *    del prototipo, que es la que ya está pensada para esa distancia.
 *
 * 2. **Las áreas táctiles.** La cajera trabaja de pie, con prisa y a veces con
 *    una prenda en la mano. Los 44px mínimos de la web se quedan cortos: aquí
 *    el mínimo es 56 y los botones de cobro son de 72. No es una licencia
 *    estética, es el único ajuste que la ergonomía obliga.
 *
 * Los COLORES no se tocan. Ni uno.
 */
import { colors } from './colors.ts'
import { fontStacks } from './typography.ts'

export const nativeColors = colors

/**
 * Nombres de familia tal como los registra `expo-font`.
 *
 * En React Native no existen las pilas de respaldo: `fontFamily` acepta un
 * único nombre y si la fuente no está cargada, Android cae a su tipografía de
 * sistema sin avisar. Por eso se nombra el archivo concreto y `apps/pos` los
 * carga todos antes de pintar nada.
 */
export const nativeFonts = {
  display: 'InstrumentSerif_400Regular',
  displayItalic: 'InstrumentSerif_400Regular_Italic',
  text: 'Figtree_400Regular',
  textMedium: 'Figtree_500Medium',
  textSemiBold: 'Figtree_600SemiBold',
  textBold: 'Figtree_700Bold',
} as const

/** Las pilas CSS, por si algo del POS renderiza a HTML (vista previa de ticket). */
export const nativeFontStacks = fontStacks

export interface NativeTextStyle {
  fontFamily: string
  fontSize: number
  lineHeight: number
  letterSpacing?: number
  textTransform?: 'uppercase'
}

/**
 * La escala del POS.
 *
 * `lineHeight` va en puntos absolutos porque React Native no acepta
 * multiplicadores; se calcula aquí a partir del mismo factor del prototipo y
 * se redondea, que es lo que hace el motor de texto de todas formas.
 *
 * `letterSpacing` va en puntos, no en `em`: RN no tiene unidades relativas.
 * 0.16em sobre 11px son 1.76 puntos.
 */
export const nativeText = {
  displayXl: {
    fontFamily: nativeFonts.display,
    fontSize: 46,
    lineHeight: 45,
    letterSpacing: -0.92,
  },
  headlineLg: {
    fontFamily: nativeFonts.display,
    fontSize: 32,
    lineHeight: 37,
    letterSpacing: -0.32,
  },
  headlineMd: {
    fontFamily: nativeFonts.display,
    fontSize: 28,
    lineHeight: 34,
  },
  headlineSm: {
    fontFamily: nativeFonts.display,
    fontSize: 20,
    lineHeight: 27,
  },
  bodyLg: {
    fontFamily: nativeFonts.text,
    fontSize: 19,
    lineHeight: 30,
  },
  bodyMd: {
    fontFamily: nativeFonts.text,
    fontSize: 16,
    lineHeight: 26,
  },
  navLink: {
    fontFamily: nativeFonts.textMedium,
    fontSize: 13,
    lineHeight: 13,
    letterSpacing: 1.17,
    textTransform: 'uppercase',
  },
  labelUpper: {
    fontFamily: nativeFonts.textBold,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.76,
    textTransform: 'uppercase',
  },
  price: {
    fontFamily: nativeFonts.textMedium,
    fontSize: 15,
    lineHeight: 15,
    letterSpacing: 0.3,
  },
  /**
   * Solo del POS: el importe grande del cobro y del total del carrito. La web
   * no lo necesita porque nadie lee un total a un metro de distancia.
   */
  priceDisplay: {
    fontFamily: nativeFonts.display,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -0.4,
  },
} as const satisfies Record<string, NativeTextStyle>

export type NativeTextToken = keyof typeof nativeText

/** Espaciado en puntos. `margin-edge` era `4vw`; en tablet se fija a 24. */
export const nativeSpacing = {
  edge: 24,
  gutter: 16,
  gap: 12,
  sectionSm: 24,
  sectionMd: 40,
} as const

/**
 * Alturas táctiles.
 *
 * `touchMin` es el suelo de cualquier cosa pulsable. `action` es la altura de
 * los botones de la pantalla de venta. `charge` es el botón de COBRAR, que se
 * pulsa cientos de veces al día y no puede fallar ni una.
 */
export const nativeSizes = {
  touchMin: 56,
  action: 64,
  charge: 72,
  /** Radio cero en todo, como en la web. El sistema es de esquina viva. */
  radius: 0,
  hairline: 1,
  border: 2,
} as const
