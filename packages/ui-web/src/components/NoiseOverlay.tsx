/**
 * Grano fotográfico sobre todo el sitio.
 *
 * Es una textura SVG (`feTurbulence`) al 3.5% de opacidad en `mix-blend-multiply`,
 * fija sobre el viewport. Aporta el aire de papel impreso del prototipo y es
 * lo que impide que los negros absolutos se vean digitales.
 *
 * `z-[100]` la deja por encima de todo el contenido, y `pointer-events-none`
 * hace que no intercepte ningún clic.
 */
export function NoiseOverlay() {
  return <div aria-hidden="true" className="fixed inset-0 z-[100] noise-bg mix-blend-multiply" />
}
