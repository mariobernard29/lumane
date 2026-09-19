'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { findOrderByPaymentIntent } from '@/actions/payment'

/**
 * Espera a que el webhook registre el pedido.
 *
 * Pregunta cada segundo y medio durante 30 segundos. Si pasa ese tiempo, deja
 * de preguntar y explica qué hacer en lugar de girar para siempre: el pago ya
 * ocurrió y hay constancia en Stripe, así que el peor caso es que la
 * confirmación llegue por correo unos minutos después.
 */
const INTERVALO_MS = 1500
const INTENTOS_MAX = 20

export function PaymentPoller({ paymentIntentId }: { paymentIntentId: string }) {
  const router = useRouter()
  const [agotado, setAgotado] = useState(false)
  const intentos = useRef(0)

  useEffect(() => {
    let vivo = true

    const timer = setInterval(async () => {
      if (!vivo) return
      intentos.current += 1

      if (intentos.current > INTENTOS_MAX) {
        clearInterval(timer)
        setAgotado(true)
        return
      }

      const order = await findOrderByPaymentIntent(paymentIntentId)
      if (order && vivo) {
        clearInterval(timer)
        router.replace(
          order.guestToken
            ? `/pedido/${order.orderNumber}?t=${order.guestToken}`
            : `/pedido/${order.orderNumber}`,
        )
      }
    }, INTERVALO_MS)

    return () => {
      vivo = false
      clearInterval(timer)
    }
  }, [paymentIntentId, router])

  if (agotado) {
    return (
      <div className="border-t border-surface-variant mt-8 pt-6">
        <p className="font-body-md text-body-md text-secondary mb-2">
          Tu pago está confirmado, pero el pedido está tardando en aparecer.
        </p>
        <p className="font-body-md text-[13px] text-text-muted">
          No vuelvas a pagar. Escríbenos por WhatsApp con esta referencia y lo resolvemos:{' '}
          <span className="font-price text-price text-primary">{paymentIntentId}</span>
        </p>
      </div>
    )
  }

  return (
    <p
      role="status"
      aria-live="polite"
      className="font-label-upper text-label-upper uppercase text-secondary border-t border-surface-variant mt-8 pt-6"
    >
      Registrando…
    </p>
  )
}
