/**
 * El sistema de diseño de Lumane en la tablet.
 *
 * **Por qué no Nativewind.** El plan lo dejaba como opción con su plan B
 * (riesgo 7b) y aquí se toma el plan B, por una razón concreta: Nativewind 4
 * necesita Tailwind 3 y `apps/web` usa Tailwind 4. Con `node-linker=hoisted`
 * —que Expo exige— las dos versiones compiten por la misma carpeta y el
 * resultado depende de cuál gane el izado. Cambiar la web a Tailwind 3 para
 * que el POS pueda escribir `className` sería pagar un precio alto por azúcar
 * sintáctico.
 *
 * Lo que se pierde es escribir clases; lo que NO se pierde es el sistema: los
 * colores, la tipografía y el espaciado salen del mismo `@lumane/tokens` que
 * genera el `@theme` de la web. Cambiar `accent-red` ahí sigue tiñendo las dos
 * superficies a la vez, que era lo que importaba.
 *
 * Regla: ninguna pantalla escribe un color ni un tamaño de fuente a mano. Si
 * algo no se puede expresar con estos estilos, falta un estilo aquí.
 */
import { Dimensions, StyleSheet } from 'react-native'
import {
  nativeColors,
  nativeSizes,
  nativeSpacing,
  nativeText,
  type NativeTextStyle,
} from '@lumane/tokens/native'

/**
 * Tablet compacta.
 *
 * Los tokens están medidos para la tablet de caja (Galaxy Tab A9+, unos
 * 1280 × 800 dp en horizontal). En una de 8.7" (Tab A7 Lite, unos 1000 × 600)
 * los mismos márgenes de 24, botones de 72 y títulos de 46 se comen la mitad
 * de la pantalla y la venta no cabe.
 *
 * Se decide UNA vez al arrancar, por el lado corto de la ventana: el POS va
 * fijo en horizontal y la tablet no cambia de tamaño mientras se usa. Así los
 * estilos siguen siendo `StyleSheet.create` estáticos en todas las pantallas,
 * sin un hook en cada una. En la tablet grande no cambia nada.
 */
const ventana = Dimensions.get('window')
export const compacto = Math.min(ventana.width, ventana.height) < 700

/** Sustituye tamaño e interlineado de un estilo de texto. */
function t(base: NativeTextStyle, fontSize: number, lineHeight: number): NativeTextStyle {
  return { ...base, fontSize, lineHeight }
}

const textoCompacto: Record<keyof typeof nativeText, NativeTextStyle> = {
  ...nativeText,
  // Lo grande es lo que más se reduce: un título de 46 en 600 dp de alto
  // ocupa lo que tres renglones de carrito.
  displayXl: t(nativeText.displayXl, 36, 36),
  headlineLg: t(nativeText.headlineLg, 26, 30),
  headlineMd: t(nativeText.headlineMd, 22, 27),
  headlineSm: t(nativeText.headlineSm, 18, 24),
  bodyLg: t(nativeText.bodyLg, 17, 25),
  bodyMd: t(nativeText.bodyMd, 15, 22),
  navLink: t(nativeText.navLink, 12, 12),
  price: t(nativeText.price, 14, 14),
  priceDisplay: t(nativeText.priceDisplay, 32, 36),
  // Las etiquetas de 11 ya están en el mínimo legible: no se tocan.
}

export const color = nativeColors

export const space: Record<keyof typeof nativeSpacing, number> = compacto
  ? { edge: 16, gutter: 12, gap: 8, sectionSm: 16, sectionMd: 28 }
  : nativeSpacing

/**
 * Las alturas táctiles bajan menos que el resto: 48 sigue por encima del
 * mínimo de Android (48 dp) y el botón de cobrar sigue siendo el más grande.
 */
export const size: Record<keyof typeof nativeSizes, number> = compacto
  ? { ...nativeSizes, touchMin: 48, action: 54, charge: 60 }
  : nativeSizes

export const text: Record<keyof typeof nativeText, NativeTextStyle> = compacto ? textoCompacto : nativeText

/**
 * Estilos compuestos que se repiten en todas las pantallas.
 *
 * `StyleSheet.create` congela los objetos y los registra una vez: pasarlos por
 * `style` no reasigna en cada render, que en una lista de 200 variantes se
 * nota en una tablet de gama media.
 */
export const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.surface,
  },
  screenDark: {
    flex: 1,
    backgroundColor: color['editorial-ink'],
  },
  card: {
    backgroundColor: color['paper-bright'],
    borderWidth: size.hairline,
    borderColor: color['surface-variant'],
    borderRadius: size.radius,
  },
  /** El borde negro de 2px marca lo seleccionado, igual que en el checkout web. */
  cardSelected: {
    borderWidth: size.border,
    borderColor: color.primary,
  },
  rule: {
    height: size.hairline,
    backgroundColor: color['surface-variant'],
  },
  ruleStrong: {
    height: size.hairline,
    backgroundColor: color.primary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },

  // --- Tipografía -----------------------------------------------------------
  displayXl: { ...text.displayXl, color: color.primary },
  headlineLg: { ...text.headlineLg, color: color.primary },
  headlineMd: { ...text.headlineMd, color: color.primary },
  headlineSm: { ...text.headlineSm, color: color.primary },
  bodyLg: { ...text.bodyLg, color: color.primary },
  body: { ...text.bodyMd, color: color.primary },
  bodyMuted: { ...text.bodyMd, color: color.secondary },
  label: { ...text.labelUpper, color: color.secondary },
  labelStrong: { ...text.labelUpper, color: color.primary },
  labelOnDark: { ...text.labelUpper, color: color['on-primary'] },
  navLink: { ...text.navLink, color: color.secondary },
  price: { ...text.price, color: color.primary },
  priceDisplay: { ...text.priceDisplay, color: color.primary },
  onDark: { color: color['on-primary'] },

  // --- Campos ---------------------------------------------------------------
  /** `.input-minimal` del prototipo: solo regla inferior, sin caja. */
  input: {
    ...text.bodyMd,
    color: color.primary,
    borderBottomWidth: size.hairline,
    borderBottomColor: color['surface-variant'],
    paddingVertical: 12,
    minHeight: size.touchMin,
  },
  inputFocused: {
    borderBottomColor: color.primary,
  },
})

/**
 * Sombra de las capas flotantes (hoja de cobro, menú de la cajera).
 *
 * Es la única concesión a un efecto que el sistema web no tiene, y existe
 * porque en una pantalla táctil sin cursor hace falta separar visualmente lo
 * que está encima de lo que quedó debajo. Deliberadamente sutil: el diseño es
 * plano y una sombra marcada lo rompería.
 */
export const elevation = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: -2 },
  shadowOpacity: 0.12,
  shadowRadius: 12,
  elevation: 12,
} as const
