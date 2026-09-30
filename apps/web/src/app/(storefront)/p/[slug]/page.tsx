import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { Accordion, Breadcrumbs, Button, Icon, formatDate } from '@lumane/ui-web'

import { hardenExternalLinks, renderMarkdown } from '@/lib/markdown'
import { getFaqGroups, getPage, getStorePhotos } from '@/lib/queries/pages'
import { getStoreChrome } from '@/lib/queries/layout'
import { getDefaultLocation } from '@/lib/queries/shipping'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const page = await getPage(slug)
  if (!page) return { title: 'Página no encontrada' }

  return {
    title: page.seoTitle ?? page.title,
    description: page.seoDescription ?? page.excerpt,
  }
}

/**
 * Páginas de contenido: políticas, guía de tallas, FAQ, contacto, editorial.
 *
 * Una sola ruta para todas. La forma de pintarlas la decide `pages.template`,
 * no el slug: la boutique puede renombrar una página sin que se rompa su
 * diseño.
 */
export default async function ContentPage({ params }: PageProps) {
  const { slug } = await params
  const page = await getPage(slug)
  if (!page) notFound()

  const siteHost = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').host
  const html = hardenExternalLinks(await renderMarkdown(page.body), siteHost)

  return (
    <>
      <Breadcrumbs items={[{ label: 'Inicio', href: '/' }, { label: page.title }]} />

      <article className="px-5 sm:px-margin-edge pt-8 pb-section-v-md md:pb-section-v-lg">
        <header className="max-w-3xl mb-10 md:mb-14">
          <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg mb-5">
            {page.title}
          </h1>
          {page.excerpt ? (
            <p className="font-body-md md:font-body-lg text-body-md md:text-body-lg text-secondary">
              {page.excerpt}
            </p>
          ) : null}
        </header>

        {page.template === 'faq' ? (
          <FaqSections />
        ) : page.template === 'contact' ? (
          <ContactSection html={html} />
        ) : page.template === 'store' ? (
          <StoreSection html={html} />
        ) : (
          <div className="prose-lumane max-w-3xl" dangerouslySetInnerHTML={{ __html: html }} />
        )}

        {/* Las páginas legales llevan su fecha: es lo que permite saber qué
            versión aceptaste. El resto no la necesita. */}
        {['privacidad', 'terminos', 'cookies'].includes(page.slug) ? (
          <p className="font-label-upper text-[10px] uppercase tracking-[0.16em] text-text-muted border-t border-surface-variant mt-12 pt-6 max-w-3xl">
            Última actualización: {formatDate(page.updatedAt)}
          </p>
        ) : null}
      </article>
    </>
  )
}

/** Acordeón de preguntas, agrupado por categoría. */
async function FaqSections() {
  const groups = await getFaqGroups()

  if (groups.length === 0) {
    return (
      <p className="font-body-md text-body-md text-secondary max-w-3xl">
        Todavía no hay preguntas publicadas. Escríbenos y te contestamos directo.
      </p>
    )
  }

  return (
    <div className="max-w-3xl flex flex-col gap-section-v-sm">
      {groups.map((group) => (
        <section key={group.category}>
          <h2 className="font-label-upper text-label-upper uppercase border-b border-primary pb-3 mb-2">
            {group.category}
          </h2>
          <Accordion
            items={group.items.map((item, index) => ({
              title: item.question,
              defaultOpen: index === 0 && group === groups[0],
              content: (
                <FaqAnswer markdown={item.answer} />
              ),
            }))}
            className="border-t-0"
          />
        </section>
      ))}
    </div>
  )
}

/** La respuesta también es Markdown: permite enlazar a otras páginas. */
async function FaqAnswer({ markdown }: { markdown: string }) {
  const siteHost = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').host
  const html = hardenExternalLinks(await renderMarkdown(markdown), siteHost)
  return <div className="prose-lumane" dangerouslySetInnerHTML={{ __html: html }} />
}

/** Contacto: los datos salen de `store_settings` y de la sucursal. */
async function ContactSection({ html }: { html: string }) {
  const [chrome, location] = await Promise.all([getStoreChrome(), getDefaultLocation()])
  const { contactEmail, whatsappNumber, openingHours } = chrome.settings
  const address = (location?.address as Record<string, string> | null) ?? {}

  const street = [address.street, address.ext_no].filter(Boolean).join(' ')
  const cityLine = [address.neighborhood, address.city, address.state].filter(Boolean).join(', ')

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-col-gap max-w-5xl">
      <div className="lg:col-span-7 prose-lumane" dangerouslySetInnerHTML={{ __html: html }} />

      <div className="lg:col-span-5 border border-primary p-6 md:p-8 bg-paper-bright">
        <h2 className="font-label-upper text-label-upper uppercase border-b border-primary pb-3 mb-6">
          Cómo encontrarnos
        </h2>

        <ul className="flex flex-col gap-6 font-body-md text-body-md">
          {whatsappNumber ? (
            <li className="flex items-start gap-3">
              <Icon name="chat" size={18} className="mt-1 text-accent-red flex-shrink-0" />
              <span>
                <span className="block font-label-upper text-[10px] uppercase tracking-[0.16em] text-secondary mb-1">
                  WhatsApp
                </span>
                <a
                  href={`https://wa.me/${whatsappNumber.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 hover:text-accent-red transition-colors"
                >
                  {whatsappNumber}
                </a>
              </span>
            </li>
          ) : null}

          {contactEmail ? (
            <li className="flex items-start gap-3">
              <Icon name="mail" size={18} className="mt-1 text-accent-red flex-shrink-0" />
              <span>
                <span className="block font-label-upper text-[10px] uppercase tracking-[0.16em] text-secondary mb-1">
                  Correo
                </span>
                <a
                  href={`mailto:${contactEmail}`}
                  className="underline underline-offset-4 hover:text-accent-red transition-colors"
                >
                  {contactEmail}
                </a>
              </span>
            </li>
          ) : null}

          <li className="flex items-start gap-3">
            <Icon name="location_on" size={18} className="mt-1 text-accent-red flex-shrink-0" />
            <span>
              <span className="block font-label-upper text-[10px] uppercase tracking-[0.16em] text-secondary mb-1">
                Boutique
              </span>
              {/* Mientras la dirección exacta no esté capturada en el
                  administrador, se muestra lo que sí se sabe en lugar de un
                  hueco o un dato inventado. */}
              {street ? (
                <>
                  {street}
                  <br />
                </>
              ) : null}
              {cityLine || 'Los Mochis, Sinaloa'}
            </span>
          </li>

          {openingHours ? (
            <li className="flex items-start gap-3">
              <Icon name="schedule" size={18} className="mt-1 text-accent-red flex-shrink-0" />
              <span>
                <span className="block font-label-upper text-[10px] uppercase tracking-[0.16em] text-secondary mb-1">
                  Horario
                </span>
                {openingHours}
              </span>
            </li>
          ) : null}
        </ul>

        <div className="border-t border-surface-variant mt-8 pt-6">
          <p className="font-body-md text-[13px] text-text-muted mb-4">
            ¿Es sobre un pedido? Tenlo a mano: en tu cuenta está el número.
          </p>
          <Button href="/cuenta" variant="outline" size="sm" fullWidth>
            Ver mis pedidos
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * La boutique: dirección, cómo llegar y fotos del local.
 *
 * **La dirección no se escribe en el cuerpo de la página.** Sale de
 * `locations`, que es de donde ya la lee la plantilla de contacto y de donde
 * la toma el cotizador de entrega local. Escribirla también en el Markdown
 * daría dos direcciones que se pueden contradecir, y la que llegaría tarde a
 * corregirse es siempre la del texto.
 */
async function StoreSection({ html }: { html: string }) {
  const [chrome, location, fotos] = await Promise.all([
    getStoreChrome(),
    getDefaultLocation(),
    getStorePhotos(),
  ])

  const { whatsappNumber, openingHours } = chrome.settings
  const a = (location?.address as Record<string, string> | null) ?? {}

  const calle = [a.street, a.ext_no].filter(Boolean).join(' ')
  const interior = a.int_no ?? ''
  const colonia = a.neighborhood ?? ''
  const ciudad = [a.postal_code, a.city, a.state].filter(Boolean).join(', ')

  /** Una sola línea, para el buscador de mapas y para copiar y pegar. */
  const direccionPlana = [calle, interior, colonia, ciudad].filter(Boolean).join(', ')

  // Google Maps embebido SIN llave: `maps.google.com/maps?output=embed` no
  // pide ninguna, y las dos llaves del proyecto están vacías.
  //
  // **Se apunta por coordenadas, no por texto.** Geocodificar la dirección deja
  // el alfiler donde Google crea que está «Álvaro Obregón 1606», que en una
  // avenida larga puede ser varias cuadras. `lat/lng` es la ficha real del
  // local.
  //
  // Y tiene un efecto secundario que vale la pena: este mapa pinta EXACTAMENTE
  // el mismo punto que `getDrivingDistance` usa como origen para cobrar la
  // entrega local. Si el alfiler cae donde debe, el cobro también. Es la única
  // comprobación visual que existe de ese dato.
  //
  // El botón «Cómo llegar» no es redundante: si el iframe no carga —bloqueador,
  // mala conexión, cambio de Google— tiene que seguir habiendo forma de llegar.
  const punto =
    location?.lat != null && location?.lng != null
      ? `${location.lat},${location.lng}`
      : (direccionPlana || 'Los Mochis, Sinaloa')
  const consulta = encodeURIComponent(punto)
  const mapaSrc = `https://maps.google.com/maps?q=${consulta}&z=17&output=embed`
  const comoLlegar = `https://www.google.com/maps/dir/?api=1&destination=${consulta}`

  // Sin `max-w`: el resto del sitio va a ancho completo con los márgenes de
  // 4vw que pone `px-margin-edge`, y un tope de 1024 px aquí dejaba el
  // contenido cortado a media pantalla mientras la barra de navegación seguía
  // hasta el borde. Se leía como si la página estuviera mal alineada, que es
  // exactamente lo que era.
  return (
    <div className="flex flex-col gap-section-v-sm">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-col-gap">
        <div className="lg:col-span-7 prose-lumane max-w-3xl" dangerouslySetInnerHTML={{ __html: html }} />

        <div className="lg:col-span-5 border border-primary p-6 md:p-8 bg-paper-bright h-fit">
          <h2 className="font-label-upper text-label-upper uppercase border-b border-primary pb-3 mb-6">
            Dónde estamos
          </h2>

          <address className="not-italic font-body-md text-body-md flex flex-col gap-6">
            <span className="flex items-start gap-3">
              <Icon name="location_on" size={18} className="mt-1 text-accent-red flex-shrink-0" />
              <span>
                {calle ? (
                  <>
                    {calle}
                    {interior ? `, ${interior}` : ''}
                    <br />
                  </>
                ) : null}
                {colonia ? (
                  <>
                    {colonia}
                    <br />
                  </>
                ) : null}
                {ciudad}
                {a.references ? (
                  <span className="block text-secondary mt-1">{a.references}</span>
                ) : null}
              </span>
            </span>

            {openingHours ? (
              <span className="flex items-start gap-3">
                <Icon name="schedule" size={18} className="mt-1 text-accent-red flex-shrink-0" />
                <span>
                  <span className="block font-label-upper text-[10px] uppercase tracking-[0.16em] text-secondary mb-1">
                    Horario
                  </span>
                  {openingHours}
                </span>
              </span>
            ) : null}

            {whatsappNumber ? (
              <span className="flex items-start gap-3">
                <Icon name="chat" size={18} className="mt-1 text-accent-red flex-shrink-0" />
                <span>
                  <span className="block font-label-upper text-[10px] uppercase tracking-[0.16em] text-secondary mb-1">
                    WhatsApp
                  </span>
                  <a
                    href={`https://wa.me/${whatsappNumber.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4 hover:text-accent-red transition-colors"
                  >
                    {whatsappNumber}
                  </a>
                </span>
              </span>
            ) : null}
          </address>

          <div className="mt-8">
            <Button
              href={comoLlegar}
              variant="solid"
              size="sm"
              fullWidth
              target="_blank"
              rel="noopener noreferrer"
            >
              Cómo llegar
            </Button>
          </div>
        </div>
      </div>

      <section aria-label="Mapa de la boutique" className="border border-surface-variant">
        <iframe
          src={mapaSrc}
          title={`Mapa de ${location?.name ?? 'la boutique'}`}
          className="block w-full h-[320px] md:h-[420px]"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </section>

      {fotos.length > 0 ? (
        <section aria-label="Fotos de la boutique">
          <h2 className="font-label-upper text-label-upper uppercase border-b border-primary pb-3 mb-6">
            La tienda
          </h2>
          {/* Dos columnas y punto. Una tercera a partir de `xl` dejaba las dos
              fotos ocupando dos tercios de la pantalla y el tercio derecho
              vacío — exactamente el descuadre que esta pasada venía a
              arreglar, reaparecido más abajo. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-col-gap">
            {fotos.map((foto) => (
              <figure key={foto.id} className="flex flex-col gap-2">
                {/* Vertical, no 4:3. Las fotos de un local se toman con el
                    teléfono en la mano y salen en retrato; recortarlas a
                    horizontal se come el techo y el suelo, que es justo lo que
                    da la sensación del espacio. */}
                <div className="relative aspect-[3/4] bg-surface overflow-hidden">
                  <Image
                    src={foto.url}
                    alt={foto.alt ?? ''}
                    fill
                    sizes="(min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
              </figure>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
