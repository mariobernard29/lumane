'use client'

import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe, type Appearance, type StripeElementsOptions } from '@stripe/stripe-js'
import { useState } from 'react'
import { Button, formatPrice } from '@lumane/ui-web'

import { startCardPayment } from '@/actions/payment'
import type { PlaceOrderInput } from '@/actions/checkout'

/**
 * Pago con tarjeta.
 *
 * Los datos de la tarjeta se escriben DENTRO de un iframe de Stripe: no pasan
 * por el navegador de Lumane ni por nuestros servidores, y por eso la tienda no
 * hereda las obligaciones de PCI de almacenarlos.
 *
 * Se usa el patrón de intento diferido (`mode: 'payment'`): el PaymentIntent no
 * se crea al cargar la página sino al pulsar pagar. Es lo que corresponde aquí,
 * porque el importe cambia mientras la clienta elige envío o aplica un cupón, y
 * crear un intento por cada cambio dejaría una fila de intentos huérfanos en
 * Stripe.
 */

// `loadStripe` fuera del componente: se carga una vez, no en cada render.
const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null

/**
 * Los tokens de Lumane aplicados al formulario de Stripe: esquina viva,
 * Figtree y monocromo. Sin esto el pago parece de otra tienda justo en el paso
 * donde más importa que parezca de esta.
 *
 * `colorDanger` también es negro. El sistema entero es monocromo y los errores
 * se distinguen por su posición —debajo del campo que falla— y por el texto,
 * no por el color.
 */
const appearance: Appearance = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#000000',
    colorBackground: '#FFFFFF',
    colorText: '#000000',
    colorTextSecondary: '#5D5F5F',
    colorTextPlaceholder: '#9A9A9A',
    colorDanger: '#000000',
    fontFamily: 'Figtree, "Helvetica Neue", sans-serif',
    fontSizeBase: '16px',
    borderRadius: '0px',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': {
      border: '0',
      borderBottom: '1px solid #E2E2E2',
      boxShadow: 'none',
      padding: '10px 0',
    },
    '.Input:focus': {
      border: '0',
      borderBottom: '1px solid #000000',
      boxShadow: 'none',
      outline: 'none',
    },
    '.Label': {
      fontSize: '11px',
      fontWeight: '700',
      letterSpacing: '0.16em',
      textTransform: 'uppercase',
      color: '#5D5F5F',
      marginBottom: '4px',
    },
    '.Tab, .Block': {
      border: '1px solid #E2E2E2',
      boxShadow: 'none',
    },
    '.Tab--selected': {
      border: '2px solid #000000',
      boxShadow: 'none',
    },
  },
}

export interface CardPaymentSectionProps {
  amountCents: number
  /** Los datos del formulario en el momento de pagar. */
  getOrderInput: () => PlaceOrderInput
  /** Validación del formulario antes de cobrar. Devuelve el error, o null. */
  validate: () => string | null
  disabled?: boolean
}

export function CardPaymentSection(props: CardPaymentSectionProps) {
  if (!stripePromise) {
    return (
      <p className="font-body-md text-body-md text-accent-red">
        El pago con tarjeta no está disponible por ahora. Elige transferencia bancaria.
      </p>
    )
  }

  const options: StripeElementsOptions = {
    mode: 'payment',
    amount: props.amountCents,
    currency: 'mxn',
    appearance,
    // Figtree dentro del iframe de Stripe. Es el único sitio del proyecto donde
    // la fuente se pide a Google en tiempo de ejecución: `next/font` no puede
    // inyectar su nombre generado ahí dentro.
    fonts: [
      { cssSrc: 'https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700' },
    ],
    locale: 'es-419',
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <CardForm {...props} />
    </Elements>
  )
}

function CardForm({ amountCents, getOrderInput, validate, disabled }: CardPaymentSectionProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState<string | null>(null)
  const [isPaying, setIsPaying] = useState(false)

  async function pay() {
    if (!stripe || !elements) return

    setError(null)

    const formError = validate()
    if (formError) {
      setError(formError)
      return
    }

    setIsPaying(true)
    try {
      // Valida los campos de la tarjeta antes de reservar inventario: no tiene
      // sentido apartar piezas si la tarjeta está incompleta.
      const { error: submitError } = await elements.submit()
      if (submitError) {
        setError(submitError.message ?? 'Revisa los datos de tu tarjeta')
        return
      }

      // Reserva el stock y abre el PaymentIntent con el importe de la base.
      const intent = await startCardPayment(getOrderInput())
      if (!intent.ok || !intent.clientSecret) {
        setError(intent.message ?? 'No pudimos iniciar el pago')
        return
      }

      // Si el total cambió entre el resumen y este momento, se aborta en lugar
      // de cobrar una cifra distinta a la que la clienta aceptó.
      if (intent.amountCents !== amountCents) {
        setError('El total cambió. Revisa el resumen y vuelve a intentarlo.')
        return
      }

      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        clientSecret: intent.clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/pago/procesando`,
        },
      })

      // Si se llega aquí, el pago NO se completó: cuando sí, Stripe redirige.
      // El pedido lo cierra el webhook, nunca esta pantalla.
      if (confirmError) {
        setError(confirmError.message ?? 'No se pudo completar el pago')
      }
    } finally {
      setIsPaying(false)
    }
  }

  return (
    <div>
      <div className="border border-surface-variant p-5 md:p-6 mb-6">
        <PaymentElement
          options={{
            layout: 'tabs',
            // Link se apaga a propósito: monta su propio bloque de marca —icono
            // verde, condiciones aparte— en mitad de un checkout monocromo, y
            // vuelve a pedir el correo y el teléfono que ya se capturaron en
            // los pasos 01 y 02. No se restringe `paymentMethodTypes` para que
            // OXXO y SPEI aparezcan solos en cuanto se activen en Stripe.
            wallets: { link: 'never' },
          }}
        />
      </div>

      {error ? (
        <p role="alert" className="font-body-md text-body-md text-accent-red mb-6">
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        variant="solid"
        fullWidth
        disabled={disabled || isPaying || !stripe}
        onClick={pay}
        className="h-16 sm:h-14"
      >
        {isPaying ? 'Procesando el pago…' : `Pagar ${formatPrice(amountCents, true)}`}
      </Button>

      <p className="font-body-md text-[13px] text-text-muted mt-4">
        Los datos de tu tarjeta se capturan directamente en Stripe. Lumane no los ve ni los
        guarda.
      </p>
    </div>
  )
}
