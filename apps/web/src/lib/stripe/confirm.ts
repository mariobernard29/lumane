import 'server-only'

import type Stripe from 'stripe'

import { createAdminSupabase } from '../supabase/server.ts'

/**
 * Registra el pedido de un PaymentIntent cobrado.
 *
 * Lo usan DOS caminos, y por eso vive aquí y no dentro del webhook:
 *
 *  1. El webhook de Stripe, que es el camino normal.
 *  2. La pantalla de «procesando», cuando el webhook no ha llegado. Pasa en
 *     desarrollo si no corre `stripe listen` —Stripe no puede llamar a
 *     localhost— y puede pasar en producción si el endpoint está mal
 *     configurado o Stripe se retrasa. Sin este camino, la clienta pagaba y
 *     su pedido no existía hasta que alguien lo notara.
 *
 * En los dos casos el PaymentIntent lo entrega STRIPE —firmado en el webhook,
 * leído con la llave secreta en la pantalla—, nunca el navegador. Y
 * `confirm_online_order` es idempotente por `provider_payment_id`: si los dos
 * caminos llegan a la vez, el segundo devuelve el pedido que creó el primero.
 */
export async function confirmFromPaymentIntent(
  intent: Stripe.PaymentIntent,
  state: 'succeeded' | 'pending' = 'succeeded',
): Promise<{ orderNumber: string; alreadyProcessed: boolean } | null> {
  const meta = intent.metadata ?? {}
  const cartToken = meta.cart_token
  if (!cartToken) {
    console.error(`[pago] ${intent.id} sin cart_token en metadata: no se puede cerrar`)
    return null
  }

  // El RPC recibe `jsonb`; los tipos generados lo expresan como `Json`.
  let address: Record<string, string | number | null> = {}
  try {
    address = meta.address
      ? (JSON.parse(meta.address) as Record<string, string | number | null>)
      : {}
  } catch {
    console.error(`[pago] ${intent.id} con dirección ilegible en metadata`)
  }

  const admin = createAdminSupabase()

  const { data, error } = await admin.rpc('confirm_online_order', {
    p_cart_token: cartToken,
    p_email: meta.email ?? intent.receipt_email ?? undefined,
    p_first_name: meta.first_name ?? undefined,
    p_last_name: meta.last_name || undefined,
    p_phone: (address.phone as string | undefined) ?? undefined,
    p_shipping_address: address,
    p_shipping_method_code: meta.shipping_method_code ?? undefined,
    p_payment: {
      method: 'stripe',
      // El importe que Stripe cobró de verdad, no el que diga el metadata.
      amount_cents: intent.amount_received > 0 ? intent.amount_received : intent.amount,
      status: state,
      provider: 'stripe',
      provider_payment_id: intent.id,
      reference: intent.latest_charge ? String(intent.latest_charge) : null,
    },
    p_distance_meters: meta.distance_meters ? Number(meta.distance_meters) : undefined,
    p_coupon_code: meta.coupon_code || undefined,
    p_accepts_marketing: meta.accepts_marketing === '1',
  })

  if (error) {
    // Se relanza: en el webhook se convierte en 500 para que Stripe
    // reintente, porque el dinero ya se movió y perder el pedido no es opción.
    throw new Error(`confirm_online_order: ${error.message}`)
  }

  const result = data as unknown as { order_number: string; already_processed: boolean }
  return { orderNumber: result.order_number, alreadyProcessed: result.already_processed }
}
