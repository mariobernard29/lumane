import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckoutSteps, formatPrice } from '@lumane/ui-web'

import { CheckoutForm } from '@/components/checkout/CheckoutForm'
import { getCart } from '@/lib/queries/cart'
import { getCurrentCustomer } from '@/lib/queries/customer'
import { getDefaultLocation, getShippingMethods } from '@/lib/queries/shipping'
import { isStripeConfigured } from '@/lib/stripe/server'

export const metadata: Metadata = {
  title: 'Pago',
  robots: { index: false },
}

/**
 * Checkout.
 *
 * Una sola pantalla, como el prototipo: contacto, dirección, envío y pago, con
 * el resumen siempre visible al lado. Partirlo en pasos añade clics sin añadir
 * claridad cuando el formulario cabe en una vista.
 */
export default async function CheckoutPage() {
  const cart = await getCart()

  // Sin bolsa no hay nada que pagar. Se manda al carrito, que ya sabe explicar
  // el estado vacío, en lugar de renderizar un formulario sin sentido.
  if (!cart || cart.lines.length === 0) redirect('/carrito')

  // Con piezas agotadas tampoco se puede continuar: hay que corregir en la
  // bolsa antes de pedir datos personales.
  if (cart.unavailable.length > 0) redirect('/carrito')

  const [methods, location, customer] = await Promise.all([
    getShippingMethods(),
    getDefaultLocation(),
    getCurrentCustomer(),
  ])

  const localCity = (location?.address as { city?: string } | null)?.city ?? 'Los Mochis'

  return (
    <>
      <CheckoutSteps
        steps={[
          { number: '01', label: 'Bolsa', href: '/carrito', state: 'done' },
          { number: '02', label: 'Envío y pago', state: 'current' },
          { number: '03', label: 'Confirmación', state: 'upcoming' },
        ]}
      />

      <div className="px-5 sm:px-margin-edge py-10 md:py-section-v-md">
        {/* Las piezas van arriba del formulario en móvil: ver qué se compra
            antes de dar datos personales reduce el abandono. */}
        <section className="mb-10 lg:mb-14">
          <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg mb-6">
            Finalizar compra
          </h1>

          <ul className="flex flex-col divide-y divide-surface-variant border-y border-surface-variant">
            {cart.lines.map((line) => (
              <li key={line.variantId} className="py-5 flex gap-5">
                <Link
                  href={`/producto/${line.productSlug}`}
                  className="relative w-20 h-26 flex-shrink-0 overflow-hidden border border-surface-variant bg-editorial-ink"
                  style={{ height: '6.5rem' }}
                >
                  <Image
                    src={line.imageUrl}
                    alt={line.productName}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                  <span className="absolute top-0 right-0 bg-accent-red text-on-primary font-label-upper text-[10px] px-2 py-1 leading-none">
                    {line.quantity}
                  </span>
                </Link>

                <div className="flex-grow flex flex-col justify-between">
                  <div>
                    <Link
                      href={`/producto/${line.productSlug}`}
                      className="font-body-md text-body-md hover:text-accent-red transition-colors"
                    >
                      {line.productName}
                    </Link>
                    <p className="font-label-upper text-label-upper uppercase text-secondary mt-1">
                      {line.variantTitle ? `Talla ${line.variantTitle}` : 'Talla única'}
                    </p>
                  </div>
                  <p className="font-price text-price">{formatPrice(line.lineTotalCents, true)}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <CheckoutForm
          methods={methods}
          initialTotals={cart.totals}
          localCity={localCity}
          stripeEnabled={isStripeConfigured()}
          customer={
            customer
              ? { email: customer.email ?? '', firstName: customer.firstName, lastName: customer.lastName }
              : null
          }
        />
      </div>
    </>
  )
}
