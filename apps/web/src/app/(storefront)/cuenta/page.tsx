import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Breadcrumbs, Icon, SectionHeader, formatPrice } from '@lumane/ui-web'

import { AccountNav } from '@/components/account/AccountNav'
import { AddressManager } from '@/components/account/AddressManager'
import { OrdersList } from '@/components/account/OrdersList'
import { ProfileForm } from '@/components/account/ProfileForm'
import { WishlistGrid } from '@/components/account/WishlistGrid'
import {
  getAccountAddresses,
  getAccountOrders,
  getAccountProfile,
  getAccountStats,
  getWishlist,
} from '@/lib/queries/account'

export const metadata: Metadata = {
  title: 'Mi cuenta',
  robots: { index: false },
}

/**
 * Área de clienta.
 *
 * Todas las secciones en una página con navegación por ancla, como el
 * prototipo: para una cuenta con cinco apartados, repartirlos en cinco rutas
 * añade esperas sin añadir claridad.
 *
 * El prototipo incluía además "Tarjetas guardadas". No se implementa: los datos
 * de una tarjeta no deben pasar por —ni almacenarse en— nuestros servidores.
 * Cuando se active Stripe, los métodos de pago guardados vivirán en Stripe y se
 * mostrarán aquí a través de su API.
 */
export default async function AccountPage() {
  const profile = await getAccountProfile()

  // El middleware ya exige sesión. Llegar aquí sin fila de clienta significa
  // que el trigger de registro no corrió: se manda a entrar de nuevo en lugar
  // de pintar una cuenta a medias.
  if (!profile) redirect('/ingresar?error=cuenta-incompleta')

  const [orders, addresses, wishlist, stats] = await Promise.all([
    getAccountOrders(),
    getAccountAddresses(),
    getWishlist(),
    getAccountStats(),
  ])

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ')
  const initials = [profile.firstName, profile.lastName]
    .filter(Boolean)
    .map((part) => part![0]!.toUpperCase())
    .join('')
    .slice(0, 2)

  return (
    <>
      <Breadcrumbs items={[{ label: 'Inicio', href: '/' }, { label: 'Mi cuenta' }]} />

      <section className="px-5 sm:px-margin-edge pt-8 pb-section-v-md md:pb-section-v-lg grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-col-gap items-start">
        <AccountNav
          initials={initials || 'L'}
          fullName={fullName}
          memberSinceYear={new Date(profile.memberSince).getFullYear()}
        />

        <div className="lg:col-span-9 flex flex-col gap-section-v-md">
          {/* ---- 01 Resumen ---- */}
          <section id="resumen" className="scroll-mt-28">
            <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg mb-4">
              Hola, {profile.firstName}
            </h1>
            <p className="font-body-md md:font-body-lg text-body-md md:text-body-lg text-secondary max-w-xl mb-10">
              Desde aquí sigues tus pedidos, guardas direcciones para pagar más rápido y armas tu
              lista de deseos.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-col-gap">
              <StatCard value={String(stats.ordersCount)} label="Pedidos realizados" />
              <StatCard
                value={formatPrice(stats.totalSpentCents)}
                label="Total comprado"
                small
              />
              <StatCard value={String(stats.wishlistCount)} label="En lista de deseos" />
            </div>
          </section>

          {/* ---- 02 Pedidos ---- */}
          <section id="pedidos" className="scroll-mt-28">
            <SectionHeader
              title="Mis pedidos"
              linkLabel={orders.length > 0 ? 'Seguir comprando' : null}
              linkHref={orders.length > 0 ? '/catalogo' : null}
            />
            <OrdersList orders={orders} />
          </section>

          {/* ---- 03 Direcciones ---- */}
          <section id="direcciones" className="scroll-mt-28">
            <SectionHeader title="Direcciones" />
            <AddressManager addresses={addresses} />
          </section>

          {/* ---- 04 Datos personales ---- */}
          <section id="datos" className="scroll-mt-28">
            <SectionHeader title="Datos personales" />
            <ProfileForm profile={profile} />
          </section>

          {/* ---- 05 Lista de deseos ---- */}
          <section id="deseos" className="scroll-mt-28">
            <SectionHeader
              title="Lista de deseos"
              linkLabel={wishlist.length > 0 ? 'Ver catálogo' : null}
              linkHref={wishlist.length > 0 ? '/catalogo' : null}
            />
            <WishlistGrid items={wishlist} />
          </section>

          <p className="font-body-md text-[13px] text-text-muted border-t border-surface-variant pt-8 flex items-start gap-2">
            <Icon name="lock" size={16} className="mt-0.5 flex-shrink-0" />
            <span>
              No guardamos datos de tarjetas en Lumane. Cuando actives el pago con tarjeta, los
              métodos guardados vivirán en la pasarela.{' '}
              <Link href="/p/privacidad" className="underline underline-offset-4">
                Aviso de privacidad
              </Link>
            </span>
          </p>
        </div>
      </section>
    </>
  )
}

function StatCard({
  value,
  label,
  small = false,
}: {
  value: string
  label: string
  small?: boolean
}) {
  return (
    <div className="border border-primary p-6 md:p-8 bg-paper-bright">
      <p
        className={
          small
            ? 'font-headline-md text-headline-md leading-none mb-3'
            : 'font-display-xl-mobile text-display-xl-mobile leading-none mb-3'
        }
      >
        {value}
      </p>
      <p className="font-label-upper text-label-upper uppercase text-secondary">{label}</p>
    </div>
  )
}
