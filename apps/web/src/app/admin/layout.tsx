import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

import { getStaffProfile, puede } from '@/lib/queries/staff'
import { SECCIONES } from './secciones.ts'

/**
 * El panel de administración de Lumane.
 *
 * **Vive fuera de `(storefront)` a propósito.** Al no estar dentro de ese
 * grupo no hereda su layout: ni cabecera, ni pie, ni `getStoreChrome`, ni la
 * cookie del carrito que vuelve dinámico todo aquel árbol. Un panel que
 * arrastrara el marco de la tienda mostraría un menú de categorías encima de
 * un formulario de precios.
 *
 * Se abre desde el navegador de la tablet, que es lo que permite administrar
 * la boutique sin computadora. Por eso los objetivos táctiles son generosos y
 * no hay nada que dependa de pasar el ratón por encima.
 *
 * **La guarda esconde, no protege.** Quien llegara aquí saltándosela no podría
 * escribir nada igualmente: cada `insert` y cada `update` pasan por RLS, que
 * exige `cms.write` o `inventory.write`. Esto existe para no enseñar un panel
 * que no serviría de nada.
 */

export const metadata: Metadata = {
  title: 'Administración · LUMANE',
  // Un panel no tiene nada que hacer en un buscador.
  robots: { index: false, follow: false },
  // Icono propio para distinguir la pestaña del panel de la de la tienda, y
  // para el acceso directo en la pantalla de inicio de la tablet.
  icons: { icon: '/icon-admin.png', apple: '/apple-icon-admin.png' },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await getStaffProfile()

  // Una clienta con sesión llega hasta aquí y sale: `get_my_staff_profile`
  // devuelve null para quien no es personal, que es la respuesta correcta.
  if (!staff) redirect('/ingresar?destino=/admin')

  const visibles = SECCIONES.filter((s) => puede(staff, s.permiso))

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-primary bg-editorial-ink">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <Link href="/admin" className="font-label-upper text-label-upper text-on-tertiary">
              LUMANE · Administración
            </Link>
            <p className="font-body-md text-body-md text-white/60">
              {`${staff.full_name} · ${staff.role.name} · ${staff.location.code}`}
            </p>
          </div>
          {/* Volver a la tienda, no cerrar sesión: es la misma cuenta y el
              mismo navegador, y lo que se quiere casi siempre es ver el
              resultado del cambio recién guardado. */}
          <Link
            href="/"
            className="border border-white/40 px-4 py-2 font-label-upper text-label-upper text-on-tertiary"
          >
            Ver la tienda
          </Link>
        </div>

        {visibles.length > 0 ? (
          <nav aria-label="Secciones" className="flex flex-wrap gap-x-5 gap-y-2 px-5 pb-3">
            {visibles.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="font-nav-link text-nav-link text-on-primary-container hover:text-on-primary"
              >
                {s.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 py-8">{children}</main>
    </div>
  )
}
