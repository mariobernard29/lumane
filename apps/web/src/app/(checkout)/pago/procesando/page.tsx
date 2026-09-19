import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Button, CheckoutSteps, Icon } from '@lumane/ui-web'

import { findOrderByPaymentIntent } from '@/actions/payment'
import { PaymentPoller } from '@/components/checkout/PaymentPoller'

export const metadata: Metadata = {
  title: 'Procesando tu pago',
  robots: { index: false },
}

/**
 * Pantalla entre el cobro y la confirmación.
 *
 * Stripe devuelve aquí en cuanto el pago se autoriza, pero el pedido lo crea el
 * WEBHOOK y ese aviso puede tardar un segundo o dos. Sin esta pantalla la
 * clienta aterrizaría en un "pedido no encontrado" justo después de pagar, que
 * es el peor momento posible para dudar de si su dinero salió.
 *
 * Aquí no se cierra nada: solo se pregunta si ya existe. Cerrar el pedido desde
 * el navegador sería fiarse de quien compra.
 */
export default async function ProcessingPage({
  searchParams,
}: {
  searchParams: Promise<{ payment_intent?: string; redirect_status?: string }>
}) {
  const { payment_intent: paymentIntent, redirect_status: status } = await searchParams

  if (!paymentIntent) redirect('/carrito')

  // Puede que el webhook haya llegado antes que la clienta: en ese caso se
  // salta la espera y va directo a su pedido.
  const order = await findOrderByPaymentIntent(paymentIntent)
  if (order) {
    redirect(
      order.guestToken
        ? `/pedido/${order.orderNumber}?t=${order.guestToken}`
        : `/pedido/${order.orderNumber}`,
    )
  }

  const failed = status === 'failed'

  return (
    <>
      <CheckoutSteps
        steps={[
          { number: '01', label: 'Bolsa', href: '/carrito', state: 'done' },
          { number: '02', label: 'Envío y pago', state: 'done' },
          { number: '03', label: 'Confirmación', state: 'current' },
        ]}
      />

      <div className="px-5 sm:px-margin-edge py-section-v-md md:py-section-v-lg">
        <div className="max-w-xl border border-primary p-8 md:p-12">
          {failed ? (
            <>
              <p className="font-label-upper text-label-upper uppercase text-accent-red mb-4">
                El pago no se completó
              </p>
              <h1 className="font-headline-md text-headline-md mb-4">No se hizo ningún cargo</h1>
              <p className="font-body-md text-body-md text-secondary mb-8">
                Tu bolsa sigue intacta y las piezas volvieron a estar disponibles. Puedes intentar
                con otra tarjeta o pagar por transferencia.
              </p>
              <Button href="/pago" variant="solid" size="md">
                Volver al pago
              </Button>
            </>
          ) : (
            <>
              <p className="font-label-upper text-label-upper uppercase text-accent-red mb-4 flex items-center gap-2">
                <Icon name="lock" size={16} />
                Pago recibido
              </p>
              <h1 className="font-headline-md text-headline-md mb-4">
                Estamos registrando tu pedido
              </h1>
              <p className="font-body-md text-body-md text-secondary mb-2">
                Tu pago se procesó correctamente. Solo falta que quede asentado; tarda unos
                segundos.
              </p>
              <p className="font-body-md text-[13px] text-text-muted">
                No cierres esta ventana. Si tarda más de lo normal, te enviamos la confirmación por
                correo de todos modos.
              </p>

              <PaymentPoller paymentIntentId={paymentIntent} />
            </>
          )}
        </div>
      </div>
    </>
  )
}
