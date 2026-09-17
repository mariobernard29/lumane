import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Accordion, Breadcrumbs, Button, Icon, formatDate } from '@lumane/ui-web'

import { hardenExternalLinks, renderMarkdown } from '@/lib/markdown'
import { getFaqGroups, getPage } from '@/lib/queries/pages'
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
