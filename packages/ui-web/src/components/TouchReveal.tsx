'use client'

import { useEffect } from 'react'

/**
 * Revelado táctil de las tarjetas de producto.
 *
 * En escritorio el efecto (blanco y negro → color, pie que sube) es CSS puro
 * con `:hover`. En una pantalla táctil no existe el hover, así que el primer
 * toque marca la tarjeta con `.is-pressed` y el segundo navega.
 *
 * Se monta UNA sola vez en el layout y delega en `document`: con un catálogo
 * de 90 productos, poner un listener por tarjeta sería malgastar memoria y
 * obligaría a que cada tarjeta fuese un componente de cliente.
 *
 * La clase `js` en <html> replica el truco del prototipo: sin JavaScript, las
 * fotos se ven a color desde el principio en lugar de quedarse grises para
 * siempre.
 */
export function TouchReveal() {
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('js')

    const eventName = 'PointerEvent' in window ? 'pointerdown' : 'touchstart'
    let active: Element | null = null

    const clear = () => {
      active?.classList.remove('is-pressed')
      active = null
    }

    const onPress = (event: Event) => {
      // Con ratón manda el :hover del CSS; no hay nada que hacer aquí.
      if ('pointerType' in event && (event as PointerEvent).pointerType === 'mouse') return

      const target = (event.target as Element | null)?.closest('.p-card')
      if (!target) {
        if (active) clear()
        return
      }
      if (active === target) {
        clear()
        return
      }
      clear()
      active = target
      target.classList.add('is-pressed')
    }

    document.addEventListener(eventName, onPress, { passive: true })
    return () => {
      document.removeEventListener(eventName, onPress)
      root.classList.remove('js')
    }
  }, [])

  return null
}
