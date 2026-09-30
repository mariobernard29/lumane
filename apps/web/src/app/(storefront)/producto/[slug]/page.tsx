import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  Accordion,
  Badge,
  Breadcrumbs,
  Icon,
  ProductCard,
  Rating,
  SectionHeader,
  formatDate,
  formatPrice,
} from '@lumane/ui-web'

import { BuyBox } from '@/components/product/BuyBox'
import { FavoriteButton } from '@/components/product/FavoriteButton'
import { ProductGallery } from '@/components/product/ProductGallery'
import { searchCatalog } from '@/lib/queries/catalog'
import { getProduct } from '@/lib/queries/product'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const product = await getProduct(slug)
  if (!product) return { title: 'Pieza no encontrada' }

  return {
    title: product.seoTitle ?? product.name,
    description: product.seoDescription ?? product.shortDescription,
    openGraph: {
      title: product.seoTitle ?? product.name,
      description: product.seoDescription ?? product.shortDescription ?? undefined,
      images: product.images[0] ? [{ url: product.images[0].url }] : undefined,
      type: 'website',
    },
  }
}

/**
 * Ficha de producto.
 *
 * Galería a la izquierda (7 columnas) y panel de compra pegajoso a la derecha
 * (5 columnas), como en el prototipo: al hacer scroll por los detalles, el
 * botón de comprar sigue a la vista.
 */
export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params
  const product = await getProduct(slug)
  if (!product) notFound()

  // Relacionados: piezas de la misma categoría. Se piden cinco para poder
  // descartar la actual y quedarse con cuatro.
  const related = product.categorySlug
    ? await searchCatalog({ categorySlug: product.categorySlug, limit: 5 })
    : { items: [] }
  const relatedItems = related.items.filter((i) => i.slug !== product.slug).slice(0, 4)

  const discount =
    product.compareAtFromCents && product.compareAtFromCents > product.priceFromCents
      ? Math.round(
          ((product.compareAtFromCents - product.priceFromCents) / product.compareAtFromCents) * 100,
        )
      : null

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Inicio', href: '/' },
          { label: 'Catálogo', href: '/catalogo' },
          ...(product.categoryName && product.categorySlug
            ? [{ label: product.categoryName, href: `/catalogo/${product.categorySlug}` }]
            : []),
          { label: product.name },
        ]}
      />

      <section className="px-5 sm:px-margin-edge pt-8 pb-section-v-md grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-col-gap items-start">
        <ProductGallery images={product.images} productName={product.name} />

        <div className="lg:col-span-5 lg:sticky lg:top-[128px]">
          <div className="flex items-center justify-between gap-4 mb-5">
            <span className="font-label-upper text-label-upper uppercase text-accent-red">
              {[product.categoryName, product.collectionName].filter(Boolean).join(' · ')}
            </span>
            <Badge variant="data">SKU {product.displaySku}</Badge>
          </div>

          <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg leading-tight mb-4">
            {product.name}
          </h1>

          <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
            <p className="font-headline-md text-headline-md flex items-baseline gap-3">
              {formatPrice(product.priceFromCents)}
              {product.compareAtFromCents ? (
                <>
                  <span className="font-price text-price text-text-muted line-through">
                    {formatPrice(product.compareAtFromCents)}
                  </span>
                  {discount ? <Badge variant="solid">-{discount}%</Badge> : null}
                </>
              ) : null}
            </p>
            {product.rating ? (
              <Rating value={product.rating.average} count={product.rating.count} href="#resenas" />
            ) : null}
          </div>

          {/* Solo el primer párrafo: el resto vive en el acordeón "Detalles y
              ajuste". Aquí manda decidir rápido, no leerlo todo. */}
          {product.longDescription ? (
            <p className="font-body-md text-body-md text-secondary mb-2">
              {product.longDescription.split('\n\n')[0]}
            </p>
          ) : product.shortDescription ? (
            <p className="font-body-md text-body-md text-secondary mb-2">{product.shortDescription}</p>
          ) : null}

          <BuyBox
            productName={product.name}
            options={product.options}
            variants={product.variants}
            sizeGuideHref="/p/guia-de-tallas"
            fitNote={product.fitNote}
          />

          <FavoriteButton productId={product.id} />

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10 font-body-md text-[14px] text-secondary">
            {[
              { icon: 'local_shipping', label: 'Envío estándar $149 · express $219' },
              { icon: 'autorenew', label: '14 días para cambiar de opinión' },
              { icon: 'storefront', label: 'Recoge gratis en la boutique' },
              { icon: 'chat', label: 'Asesoría por WhatsApp' },
            ].map((service) => (
              <li key={service.label} className="flex items-center gap-3">
                <Icon name={service.icon} size={18} className="text-accent-red" />
                {service.label}
              </li>
            ))}
          </ul>

          <Accordion
            items={[
              {
                number: '01',
                title: 'Detalles y ajuste',
                content: (
                  <div className="font-body-md text-body-md text-secondary space-y-3">
                    {product.longDescription ? (
                      <p className="whitespace-pre-line">{product.longDescription}</p>
                    ) : (
                      <p>
                        Traemos pocas piezas de cada modelo. Escríbenos por WhatsApp si necesitas
                        medidas exactas antes de comprar.
                      </p>
                    )}
                  </div>
                ),
              },
              {
                number: '02',
                title: 'Composición y cuidado',
                content: (
                  <ul className="list-disc space-y-2 font-body-md text-body-md text-secondary marker:text-accent-red">
                    <li>Lavar a mano o en ciclo delicado, con agua fría.</li>
                    <li>No usar blanqueador. Planchar a temperatura baja del revés.</li>
                    <li>Secar a la sombra, en horizontal, para conservar la forma.</li>
                  </ul>
                ),
              },
              {
                number: '03',
                title: 'Envíos y devoluciones',
                content: (
                  <ul className="list-disc space-y-2 font-body-md text-body-md text-secondary marker:text-accent-red">
                    <li>Envío estándar $149 MXN · express $219 MXN · recoger en boutique sin costo.</li>
                    <li>Entrega local en Los Mochis con tarifa según la distancia.</li>
                    <li>14 días naturales para cambios, con la pieza sin uso y su etiqueta.</li>
                  </ul>
                ),
              },
            ]}
          />
        </div>
      </section>

      {/* ---- Reseñas ---- */}
      {product.rating && product.reviews.length > 0 ? (
        <section
          id="resenas"
          className="scroll-mt-28 border-t border-primary px-5 sm:px-margin-edge py-section-v-md"
        >
          <SectionHeader eyebrow="Clientas" title="Lo que dicen de esta pieza" />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-col-gap">
            <div className="lg:col-span-4">
              <div className="border border-primary p-8 bg-paper-bright">
                <p className="font-display-xl-mobile text-display-xl-mobile leading-none mb-2">
                  {product.rating.average.toFixed(1)}
                </p>
                <Rating value={product.rating.average} size={18} className="mb-5" />
                <p className="font-label-upper text-[10px] uppercase tracking-[0.16em] text-secondary mb-6">
                  {product.rating.count} {product.rating.count === 1 ? 'reseña' : 'reseñas'}
                </p>

                <ul className="flex flex-col gap-2">
                  {product.rating.distribution.map((bucket) => (
                    <li key={bucket.stars} className="flex items-center gap-3">
                      <span className="font-price text-price w-8">{bucket.stars}★</span>
                      <span className="flex-1 h-1.5 bg-surface-variant">
                        <span
                          className="block h-full bg-primary"
                          style={{ width: `${bucket.percent}%` }}
                        />
                      </span>
                      <span className="font-price text-price w-8 text-right text-text-muted">
                        {bucket.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="lg:col-span-8 flex flex-col divide-y divide-surface-variant">
              {product.reviews.map((review) => (
                <article key={review.id} className="py-8 first:pt-0">
                  <p className="font-label-upper text-[10px] uppercase tracking-[0.16em] text-text-muted mb-3">
                    {formatDate(review.createdAt)}
                  </p>
                  <Rating value={review.rating} size={16} className="mb-3" />
                  {review.title ? (
                    <h3 className="font-headline-sm text-headline-sm mb-2">{review.title}</h3>
                  ) : null}
                  <p className="font-body-md text-body-md text-secondary max-w-2xl mb-4">
                    {review.body}
                  </p>
                  <p className="font-label-upper text-label-upper uppercase text-secondary">
                    {review.authorName}
                    {review.isVerified ? (
                      <span className="text-accent-red ml-2">Compra verificada</span>
                    ) : null}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ---- Relacionados ---- */}
      {relatedItems.length > 0 ? (
        <section className="border-t border-primary px-5 sm:px-margin-edge py-section-v-md">
          <SectionHeader
            title="También te podría gustar"
            linkLabel="Ver todo el catálogo"
            linkHref={product.categorySlug ? `/catalogo/${product.categorySlug}` : '/catalogo'}
          />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 md:gap-x-col-gap gap-y-10">
            {relatedItems.map((item) => (
              <ProductCard
                key={item.id}
                href={`/producto/${item.slug}`}
                name={item.name}
                imageUrl={item.imageUrl}
                imageAlt={item.imageAlt}
                priceCents={item.priceCents}
                compareAtPriceCents={item.compareAtPriceCents}
              />
            ))}
          </div>
        </section>
      ) : null}
    </>
  )
}
