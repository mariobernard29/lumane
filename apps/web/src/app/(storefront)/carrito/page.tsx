import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs, Button, EmptyState, Icon, formatPrice } from '@lumane/ui-web'

import { CartLineRow } from '@/components/cart/CartLineRow'
import { getCart } from '@/lib/queries/cart'

export const metadata: Metadata = {
  title: 'Tu bolsa',
  robots: { index: false },
}

/**
 * La bolsa.
 *
 * El prototipo no tenía esta página: iba del icono de la bolsa directo al
 * checkout. Sin un paso intermedio no hay dónde cambiar cantidades ni quitar
 * una pieza, y es justo donde se decide si la compra sigue adelante.
 *
 * Los totales que se ven aquí NO incluyen envío: aún no hay dirección. El
 * envío aparece en el checkout, cuando ya se sabe a dónde va.
 */
export default async function CartPage() {
  const cart = await getCart()
  const isEmpty = !cart || cart.lines.length === 0

  return (
    <>
      <Breadcrumbs items={[{ label: 'Inicio', href: '/' }, { label: 'Tu bolsa' }]} />

      <section className="px-5 sm:px-margin-edge pt-8 pb-section-v-md md:pb-section-v-lg">
        <h1 className="font-display-xl-mobile md:font-display-xl text-display-xl-mobile md:text-display-xl uppercase mb-10 md:mb-14">
          Tu bolsa
        </h1>

        {isEmpty ? (
          <EmptyState
            icon="shopping_bag"
            title="Tu bolsa está vacía"
            body="Todavía no has agregado ninguna pieza. Empieza por el catálogo o mira lo último que llegó."
            action={
              <div className="flex flex-wrap gap-4 justify-center">
                <Button href="/catalogo" variant="solid" size="md">
                  Ver el catálogo
                </Button>
                <Button href="/rebajas" variant="outline" size="md">
                  Ver rebajas
                </Button>
              </div>
            }
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-col-gap items-start">
            <div className="lg:col-span-7">
              <div className="flex items-center justify-between border-b border-primary pb-4">
                <p className="font-label-upper text-label-upper uppercase">
                  {cart.itemCount} {cart.itemCount === 1 ? 'pieza' : 'piezas'}
                </p>
                <Link
                  href="/catalogo"
                  className="font-label-upper text-label-upper uppercase text-secondary hover:text-accent-red transition-colors"
                >
                  Seguir comprando
                </Link>
              </div>

              <ul className="flex flex-col divide-y divide-surface-variant">
                {cart.lines.map((line) => (
                  <CartLineRow key={line.variantId} line={line} />
                ))}
              </ul>
            </div>

            <aside className="lg:col-span-5 lg:sticky lg:top-[128px] border border-primary bg-surface p-6 md:p-8">
              <h2 className="font-headline-md text-headline-md mb-6">Resumen</h2>

              <dl className="flex flex-col gap-3 font-body-md text-body-md border-b border-surface-variant pb-6 mb-6">
                <div className="flex justify-between">
                  <dt className="text-secondary">Subtotal</dt>
                  <dd className="font-price text-price">
                    {formatPrice(cart.totals.subtotalCents, true)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-secondary">Envío</dt>
                  <dd className="font-label-upper text-label-upper uppercase text-secondary">
                    Se calcula al pagar
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-secondary">IVA</dt>
                  <dd className="font-label-upper text-label-upper uppercase text-secondary">
                    Incluido
                  </dd>
                </div>
              </dl>

              <div className="flex justify-between items-baseline mb-8">
                <span className="font-label-upper text-label-upper uppercase">Total</span>
                <span className="font-headline-md text-headline-md">
                  {formatPrice(cart.totals.totalCents, true)}
                </span>
              </div>

              {cart.unavailable.length > 0 ? (
                <p className="font-body-md text-[13px] text-accent-red mb-5">
                  Hay piezas sin inventario suficiente. Ajusta las cantidades para continuar.
                </p>
              ) : null}

              <Button
                href="/pago"
                variant="solid"
                fullWidth
                icon="east"
                className={
                  cart.unavailable.length > 0 ? 'pointer-events-none opacity-40' : undefined
                }
              >
                Continuar al pago
              </Button>

              <p className="flex items-center justify-center gap-2 font-label-upper text-[10px] uppercase tracking-[0.16em] text-secondary mt-5">
                <Icon name="lock" size={14} />
                Pago seguro
              </p>
            </aside>
          </div>
        )}
      </section>
    </>
  )
}
