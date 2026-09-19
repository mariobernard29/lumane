import 'server-only'

import Stripe from 'stripe'

/**
 * Cliente de Stripe del servidor.
 *
 * Se construye perezosamente para que la aplicación pueda arrancar y navegarse
 * sin llaves: lo que no debe funcionar es el cobro, no el catálogo. Si falta la
 * llave, `isStripeConfigured()` lo dice y el checkout oculta el pago con
 * tarjeta en lugar de ofrecer un botón que reventaría.
 */

let client: Stripe | null = null

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('Falta STRIPE_SECRET_KEY: el pago con tarjeta no está configurado.')
  }

  client ??= new Stripe(key, {
    // Se fija la versión de API: que Stripe publique una nueva no debe cambiar
    // el comportamiento de los cobros de Lumane sin que nadie lo revise.
    apiVersion: '2026-08-26.dahlia',
    appInfo: { name: 'Lumane', version: '1.0.0' },
    typescript: true,
  })

  return client
}

/**
 * Stripe trabaja en la unidad mínima de la divisa. El peso mexicano tiene dos
 * decimales, así que un centavo nuestro es exactamente una unidad de Stripe y
 * no hay conversión que equivocar. Existe esta función para que el día que se
 * venda en otra divisa el ajuste esté en un solo sitio.
 */
export function toStripeAmount(cents: number): number {
  return cents
}
