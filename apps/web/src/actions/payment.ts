'use server'

import { errorMessage } from '@lumane/db'

import {
  quoteCheckout,
  type PlaceOrderInput,
} from '@/actions/checkout'
import { readCartToken } from '@/lib/cart/session'
import { confirmFromPaymentIntent } from '@/lib/stripe/confirm'
import { getStripe, isStripeConfigured, toStripeAmount } from '@/lib/stripe/server'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Pago con tarjeta.
 *
 * El navegador NUNCA confirma el pedido. Esta acción solo reserva el stock y
 * abre un PaymentIntent con el importe que calcula la base; quien da el pedido
 * por cerrado es el webhook de Stripe, que es el único que puede afirmar que el
 * cobro ocurrió de verdad. Si el cierre dependiera de una llamada del cliente,
 * bastaría con abrir la consola para regalarse pedidos pagados.
 *
 * Los datos del pedido viajan en el `metadata` del PaymentIntent para que el
 * webhook los tenga sin depender de nuestra sesión: llega de Stripe, sin
 * cookies.
 */

export interface CardPaymentResult {
  ok: boolean
  clientSecret?: string
  amountCents?: number
  message?: string
}

export async function startCardPayment(input: PlaceOrderInput): Promise<CardPaymentResult> {
  if (!isStripeConfigured()) {
    return { ok: false, message: 'El pago con tarjeta no está disponible por ahora.' }
  }

  const token = await readCartToken()
  if (!token) return { ok: false, message: 'Tu bolsa está vacía' }

  const supabase = await createServerSupabase()

  // ---- 1. Reservar antes de cobrar ------------------------------------------
  // Si algo se agotó mientras llenaba el formulario, se entera AQUÍ, no después
  // de que le hayan cargado la tarjeta.
  const { error: reserveError } = await supabase.rpc('reserve_cart_stock', { p_token: token })
  if (reserveError) {
    return { ok: false, message: errorMessage(reserveError) }
  }

  // ---- 2. El importe lo pone la base ---------------------------------------
  const quote = await quoteCheckout({
    shippingMethodCode: input.shippingMethodCode,
    couponCode: input.couponCode ?? null,
    lat: input.address.lat,
    lng: input.address.lng,
  })

  if (!quote.ok || !quote.totals) {
    await release(token)
    return { ok: false, message: quote.message ?? 'No pudimos calcular el total' }
  }

  if (quote.totals.shippingAvailable === false) {
    await release(token)
    return { ok: false, message: 'Ese método de envío no llega a tu dirección. Elige otro.' }
  }

  const amountCents = quote.totals.totalCents
  // Los metros exactos, no `distanceKm × 1000`: ver `QuoteResult.distanceMeters`.
  const distanceMeters = quote.distanceMeters ?? null

  // ---- 3. PaymentIntent -----------------------------------------------------
  try {
    const stripe = getStripe()
    const a = input.address

    const intent = await stripe.paymentIntents.create({
      amount: toStripeAmount(amountCents),
      currency: 'mxn',
      // Stripe decide qué métodos mostrar según lo habilitado en el panel
      // (tarjeta, OXXO, SPEI). Fijarlos aquí obligaría a redesplegar para
      // activar uno nuevo.
      automatic_payment_methods: { enabled: true },
      receipt_email: input.email,
      description: `Pedido en línea · Lumane`,
      shipping: {
        name: a.recipient,
        phone: a.phone,
        address: {
          line1: [a.street, a.extNo].filter(Boolean).join(' '),
          line2: [a.intNo ? `Int. ${a.intNo}` : null, a.neighborhood].filter(Boolean).join(' · ') || undefined,
          city: a.city,
          state: a.state,
          postal_code: a.postalCode,
          country: 'MX',
        },
      },
      metadata: {
        cart_token: token,
        email: input.email,
        first_name: input.firstName,
        last_name: input.lastName ?? '',
        shipping_method_code: input.shippingMethodCode,
        coupon_code: input.couponCode ?? '',
        distance_meters: distanceMeters != null ? String(distanceMeters) : '',
        accepts_marketing: input.acceptsMarketing ? '1' : '0',
        // Los campos que Stripe no modela (colonia, referencias, coordenadas)
        // van aquí para que el webhook reconstruya la dirección completa.
        address: JSON.stringify({
          recipient: a.recipient,
          street: a.street,
          ext_no: a.extNo,
          int_no: a.intNo,
          neighborhood: a.neighborhood,
          city: a.city,
          state: a.state,
          postal_code: a.postalCode,
          country: a.country ?? 'MX',
          phone: a.phone,
          delivery_notes: a.deliveryNotes,
          lat: a.lat,
          lng: a.lng,
        }).slice(0, 500),
      },
    })

    if (!intent.client_secret) {
      await release(token)
      return { ok: false, message: 'No pudimos iniciar el pago. Vuelve a intentarlo.' }
    }

    return { ok: true, clientSecret: intent.client_secret, amountCents }
  } catch (error) {
    console.error('[pago] no se pudo crear el PaymentIntent:', error)
    await release(token)
    return { ok: false, message: 'No pudimos iniciar el pago. Vuelve a intentarlo.' }
  }
}

/**
 * Libera la reserva cuando el pago no llega a abrirse.
 *
 * Por token, no con la llave de servicio: la limpieza no puede necesitar más
 * privilegio que la operación que limpia (ver migración 0028).
 */
async function release(token: string): Promise<void> {
  const supabase = await createServerSupabase()
  const { error } = await supabase.rpc('release_cart_stock', { p_token: token })
  if (error) console.error('[pago] no se pudo liberar la reserva:', error.message)
}

/**
 * Consulta si el webhook ya cerró el pedido de un PaymentIntent.
 *
 * La pantalla de "procesando" pregunta por aquí en lugar de cerrar el pedido
 * por su cuenta: el aviso de Stripe puede tardar un par de segundos y la
 * clienta no debe quedarse mirando una página en blanco, pero tampoco puede
 * ser ella quien confirme el cobro.
 */
export async function findOrderByPaymentIntent(
  paymentIntentId: string,
): Promise<{ orderNumber: string; guestToken: string | null } | null> {
  if (!/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId)) return null

  const found = await lookupOrder(paymentIntentId)
  if (found) return found

  // Sin pedido todavía. Si el webhook ya debió llegar y no llegó, se le
  // pregunta a Stripe directamente y se registra con la misma función que usa
  // el webhook (ver `confirmFromPaymentIntent`).
  if (await reconcileWithStripe(paymentIntentId)) return lookupOrder(paymentIntentId)
  return null
}

async function lookupOrder(
  paymentIntentId: string,
): Promise<{ orderNumber: string; guestToken: string | null } | null> {
  const supabase = await createServerSupabase()
  const { data } = await supabase.rpc('get_order_by_payment_intent', {
    p_provider_payment_id: paymentIntentId,
  })

  if (!data) return null
  const row = data as unknown as { order_number: string; guest_token: string | null }
  if (!row?.order_number) return null

  return { orderNumber: row.order_number, guestToken: row.guest_token }
}

/**
 * Lo que dio al webhook este margen para llegar primero. Normalmente llega en
 * uno o dos segundos; antes de esto la pantalla solo espera, para no pedirle
 * a Stripe el mismo PaymentIntent en cada sondeo de una compra que va bien.
 */
const MARGEN_WEBHOOK_S = 8

/**
 * Registra el pedido si Stripe dice que el cobro ocurrió.
 *
 * Seguro aunque lo dispare el navegador: el navegador solo aporta el ID, y el
 * estado, el importe y los datos del pedido se leen de Stripe con la llave
 * secreta. Un ID inventado no existe en Stripe; uno real sin cobrar no está
 * en `succeeded`.
 */
async function reconcileWithStripe(paymentIntentId: string): Promise<boolean> {
  if (!isStripeConfigured()) return false

  try {
    const intent = await getStripe().paymentIntents.retrieve(paymentIntentId)

    const edad = Date.now() / 1000 - intent.created
    if (edad < MARGEN_WEBHOOK_S) return false

    const state =
      intent.status === 'succeeded' ? 'succeeded'
      : intent.status === 'processing' ? 'pending'
      : null
    if (!state) return false

    const result = await confirmFromPaymentIntent(intent, state)
    if (result && !result.alreadyProcessed) {
      // Que quede rastro: si esto aparece en producción, el webhook no está
      // llegando y hay que revisar su configuración en Stripe.
      console.warn(`[pago] ${intent.id} → pedido ${result.orderNumber} registrado SIN webhook`)
    }
    return result != null
  } catch (error) {
    console.error(`[pago] no se pudo conciliar ${paymentIntentId} con Stripe:`, error)
    return false
  }
}
