import { Hero, Newsletter, ServicesBar } from '@lumane/ui-web'

import { subscribeToNewsletter } from '@/actions/newsletter'
import { HomeSections } from '@/components/cms/HomeSections'
import {
  getCategoryTiles,
  getCollectionTiles,
  getHero,
  getPageSections,
  getServices,
} from '@/lib/queries/home'
import { getStoreChrome } from '@/lib/queries/layout'
import { getNewArrivals, getOnSale } from '@/lib/queries/products'

/**
 * Portada.
 *
 * Reproduce la secuencia editorial del prototipo: portada a sangre, franja de
 * servicios y luego secciones numeradas (01 / Comprar, 02 / Novedades…), cada
 * una con su encabezado sobre una regla y su enlace «ver todo».
 *
 * Ni un texto ni una imagen están escritos aquí: los cinco bloques salen de
 * `page_sections` desde la migración 0053, y `HomeSections` decide qué
 * renderizador usa cada uno. Hasta entonces esta afirmación estaba en este
 * mismo comentario y era falsa — los encabezados, los enlaces y el párrafo de
 * «Nuestra casa» vivían en el JSX de abajo.
 *
 * Los datos se piden todos en paralelo aunque una sección concreta pueda no
 * usarlos: son consultas pequeñas contra índices, y encadenarlas a lo que diga
 * `page_sections` convertiría una ronda en dos.
 *
 * Nota sobre caché: hoy se renderiza en cada petición, porque el marco de la
 * tienda lee la cookie del carrito y eso vuelve dinámica toda la ruta. Poner
 * aquí un `export const revalidate` sería engañoso: no haría nada. La caché
 * por entidad con invalidación desde la base es trabajo de la Fase 4.
 */
export default async function HomePage() {
  const [hero, services, sections, categories, newArrivals, onSale, collections, chrome] =
    await Promise.all([
      getHero('home'),
      getServices(),
      getPageSections('home'),
      getCategoryTiles(4),
      getNewArrivals(4),
      getOnSale(3),
      getCollectionTiles(4),
      getStoreChrome(),
    ])

  return (
    <>
      {hero ? <Hero {...hero} /> : null}
      <ServicesBar items={services} />

      <HomeSections
        sections={sections}
        datos={{ categories, newArrivals, onSale, collections }}
      />

      <Newsletter
        eyebrow="Boletín"
        title={chrome.settings.newsletterTitle ?? 'Antes que nadie.'}
        body={chrome.settings.newsletterBody}
        disclaimer={chrome.settings.newsletterDisclaimer}
        tone="dark"
        action={subscribeToNewsletter}
      />
    </>
  )
}
