import type Stripe from 'stripe'
import { NextResponse, type NextRequest } from 'next/server'

import { confirmFromPaymentIntent } from '@/lib/stripe/confirm'
import { getStripe, isStripeConfigured } from '@/lib/stripe/server'
import { createAdminSupabase } from '@/lib/supabase/server'

/**
 * Webhook de Stripe. Es el único sitio donde un pedido se da por pagado.
 *
 * Tres cosas no negociables:
 *
 * 1. **Se verifica la firma.** Sin eso, cualquiera podría hacer un POST aquí
 *    diciendo "ya pagué" y llevarse la ropa. El cuerpo se lee en crudo porque
 *    la firma se calcula sobre los bytes exactos: parsear el JSON antes rompe
 *    la verificación.
 *
 * 2. **El importe lo revalida la base.** `confirm_online_order` compara lo
 *    cobrado con lo que ella calcula y aborta si no cuadra, así que ni un
 *    `metadata` manipulado podría cambiar el total.
 *
 * 3. **Es idempotente.** Stripe reintenta los avisos: el índice único sobre
 *    `payments.provider_payment_id` hace que el segundo aviso devuelva el mismo
 *    pedido en lugar de crear otro y descontar el inventario dos veces.
 *
 * Siempre responde 200 salvo fallo genuino nuestro: un 4xx hace que Stripe
 * reintente en bucle un aviso que nunca vamos a poder procesar.
 */

export async function POST(request: NextRequest) {
  if (!isStripeConfigured()) {
    console.error('[webhook] Stripe no está configurado')
    return NextResponse.json({ received: true, handled: false }, { status: 200 })
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    // Sin el secreto no hay forma de distinguir un aviso real de uno inventado.
    // Rechazar es lo correcto: procesarlo a ciegas sería regalar pedidos.
    console.error('[webhook] falta STRIPE_WEBHOOK_SECRET: no se puede verificar la firma')
    return NextResponse.json({ error: 'webhook no configurado' }, { status: 500 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'falta la firma' }, { status: 400 })
  }

  const body = await request.text()

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret)
  } catch (error) {
    console.error('[webhook] firma inválida:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'firma inválida' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await onPaymentSucceeded(event.data.object)
        break

      case 'payment_intent.processing':
        // OXXO y SPEI son asíncronos: el pago se registra ahora y se acredita
        // horas después. El pedido se crea ya, en estado pendiente, para que
        // las piezas queden apartadas.
        await onPaymentSucceeded(event.data.object, 'pending')
        break

      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled':
        await onPaymentFailed(event.data.object)
        break

      default:
        // El resto de eventos no nos interesan, pero se confirman para que
        // Stripe no los reintente.
        break
    }
  } catch (error) {
    console.error(`[webhook] fallo procesando ${event.type}:`, error)
    // 500 para que Stripe reintente: el cobro ocurrió y el pedido TIENE que
    // quedar registrado.
    return NextResponse.json({ error: 'error al procesar' }, { status: 500 })
  }

  return NextResponse.json({ received: true }, { status: 200 })
}

async function onPaymentSucceeded(
  intent: Stripe.PaymentIntent,
  state: 'succeeded' | 'pending' = 'succeeded',
): Promise<void> {
  const result = await confirmFromPaymentIntent(intent, state)
  if (!result) return
  console.log(
    `[webhook] ${intent.id} → pedido ${result.orderNumber}` +
      (result.alreadyProcessed ? ' (ya estaba registrado)' : ''),
  )
}

/**
 * Pago fallido o cancelado: se devuelve el inventario reservado.
 *
 * Sin esto, cada tarjeta rechazada dejaría piezas bloqueadas hasta que
 * caducara la reserva. El barrido de pg_cron lo arreglaría en 20 minutos, pero
 * en una boutique con dos piezas por talla, 20 minutos son una venta perdida.
 */
async function onPaymentFailed(intent: Stripe.PaymentIntent): Promise<void> {
  const cartToken = intent.metadata?.cart_token
  if (!cartToken) return

  const admin = createAdminSupabase()
  const { error } = await admin.rpc('release_cart_stock', { p_token: cartToken })

  if (error) {
    console.error(`[webhook] no se pudo liberar la reserva de ${intent.id}:`, error.message)
    return
  }
  console.log(`[webhook] ${intent.id} falló: reserva liberada`)
}
