import { Footer, Header } from '@lumane/ui-web'

import { getStoreChrome } from '@/lib/queries/layout'
import { getCurrentCustomer } from '@/lib/queries/customer'
import { readCartSummary } from '@/lib/cart/session'

/**
 * Marco de la tienda: cabecera, contenido y pie.
 *
 * Vive en un grupo de rutas `(storefront)` para que el checkout —que en el
 * prototipo tiene su propia cabecera reducida, sin buscador ni bolsa— pueda
 * quedar fuera sin heredarlo.
 */
export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const [chrome, customer, cart] = await Promise.all([
    getStoreChrome(),
    getCurrentCustomer(),
    readCartSummary(),
  ])

  return (
    <>
      <Header
        items={chrome.header}
        customerName={customer?.firstName ?? null}
        cartCount={cart.itemCount}
        logoUrl="/logo-lumane.png"
      />

      <main>{children}</main>

      <Footer
        columns={chrome.footerColumns}
        legalLinks={chrome.legalLinks}
        logoUrl="/logo-lumane.png"
        tagline={chrome.settings.tagline}
        contactEmail={chrome.settings.contactEmail}
        whatsappNumber={chrome.settings.whatsappNumber}
        openingHours={chrome.settings.openingHours}
        socialLinks={chrome.settings.socialLinks}
        copyright={chrome.settings.copyright}
      />
    </>
  )
}
