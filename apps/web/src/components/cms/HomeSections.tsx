import { Button, ProductCard, SectionHeader, Tile } from '@lumane/ui-web'

import type { CategoryTile, CollectionTile, PageSection } from '@/lib/queries/home'
import type { ProductCardData } from '@/lib/queries/products'

/**
 * Los bloques de la portada, pintados desde la base.
 *
 * Hasta la migración 0053 esto era JSX escrito a mano en `page.tsx`, con los
 * cinco encabezados, sus enlaces y el párrafo de «Nuestra casa» dentro del
 * código. Ahora la página recorre `page_sections` y cada fila elige su
 * renderizador aquí.
 *
 * Lo que se mueve a la base son los TEXTOS, el ORDEN y los LÍMITES. Lo que se
 * queda en el código es la maquetación de cada tipo: una retícula de cuatro
 * columnas con escalonado no es contenido, es diseño, y el sistema lo resuelve
 * con `@lumane/ui-web`.
 *
 * **Un `type` desconocido se descarta en silencio.** Es como se ha comportado
 * siempre el sitio con `page_sections`, y es lo que permite sembrar filas
 * nuevas antes de desplegar el código que las pinta.
 */

/** Los datos que la página ya trae y que cada bloque consume según su tipo. */
export interface DatosPortada {
  categories: CategoryTile[]
  newArrivals: ProductCardData[]
  onSale: ProductCardData[]
  collections: CollectionTile[]
}

function num(config: Record<string, unknown>, clave: string, porDefecto: number): number {
  const v = Number(config[clave])
  return Number.isFinite(v) && v > 0 ? v : porDefecto
}

function txt(config: Record<string, unknown>, clave: string): string | undefined {
  const v = config[clave]
  return typeof v === 'string' && v.trim() !== '' ? v : undefined
}

export function HomeSections({
  sections,
  datos,
}: {
  sections: PageSection[]
  datos: DatosPortada
}) {
  return (
    <>
      {sections.map((s) => (
        <Bloque key={s.id} section={s} datos={datos} />
      ))}
    </>
  )
}

function Bloque({ section, datos }: { section: PageSection; datos: DatosPortada }) {
  const config = (section.config ?? {}) as Record<string, unknown>
  const encabezado = {
    eyebrow: section.eyebrow ?? undefined,
    title: section.title ?? '',
    id: txt(config, 'anchor'),
    linkLabel: txt(config, 'link_label'),
    linkHref: txt(config, 'link_href'),
  }

  switch (section.type) {
    case 'category_grid': {
      const items = datos.categories.slice(0, num(config, 'limit', 4))
      if (items.length === 0) return null
      return (
        <section className="px-5 sm:px-margin-edge pt-section-v-md md:pt-section-v-lg">
          <SectionHeader {...encabezado} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-col-gap">
            {items.map((c) => (
              <Tile
                key={c.id}
                href={`/catalogo/${c.slug}`}
                label={c.name}
                imageUrl={c.imageUrl}
                imageAlt={c.imageAlt}
              />
            ))}
          </div>
        </section>
      )
    }

    case 'product_grid_new':
    case 'product_grid_sale': {
      const esNuevo = section.type === 'product_grid_new'
      const fuente = esNuevo ? datos.newArrivals : datos.onSale
      const items = fuente.slice(0, num(config, 'limit', esNuevo ? 4 : 3))
      if (items.length === 0) return null

      // El escalonado baja la 2.ª y la 4.ª tarjeta en escritorio: rompe la
      // retícula a propósito, como el prototipo. Es del bloque de novedades,
      // pero se pide por `config` para que la propietaria pueda quitarlo.
      const escalonar = config.stagger === true
      const columnas = items.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'

      return (
        <section className="px-5 sm:px-margin-edge pt-section-v-md md:pt-section-v-lg">
          <SectionHeader {...encabezado} />
          <div
            className={`grid grid-cols-2 ${columnas} gap-x-4 md:gap-x-col-gap gap-y-10 md:gap-y-14`}
          >
            {items.map((p, i) => (
              <ProductCard
                key={p.id}
                href={`/producto/${p.slug}`}
                name={p.name}
                subtitle={p.subtitle}
                imageUrl={p.imageUrl}
                imageAlt={p.imageAlt}
                priceCents={p.priceCents}
                compareAtPriceCents={p.compareAtPriceCents}
                labels={p.labels}
                offset={escalonar && i % 2 === 1}
                // Solo las dos primeras del primer bloque: marcar como
                // prioritarias más imágenes de las que caben en pantalla
                // retrasa justamente lo que se quería adelantar.
                priority={esNuevo && i < 2}
              />
            ))}
          </div>
        </section>
      )
    }

    case 'collection_grid': {
      const items = datos.collections.slice(0, num(config, 'limit', 4))
      if (items.length === 0) return null
      return (
        <section className="px-5 sm:px-margin-edge pt-section-v-md md:pt-section-v-lg pb-section-v-md md:pb-section-v-lg">
          <SectionHeader {...encabezado} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-col-gap gap-y-10 md:gap-y-14">
            {items.map((c) => (
              <Tile
                key={c.id}
                href={`/colecciones/${c.slug}`}
                label={c.name}
                description={c.description}
                badge={c.badge}
                ctaLabel="Ver colección"
                imageUrl={c.imageUrl}
                imageAlt={c.imageAlt}
                ratio="4/5"
              />
            ))}
          </div>
        </section>
      )
    }

    case 'about_split': {
      if (!section.title) return null
      const enlace = txt(config, 'cta_href')
      const etiqueta = txt(config, 'cta_label')

      return (
        <section
          id={txt(config, 'anchor')}
          className="scroll-mt-28 bg-editorial-ink text-on-tertiary px-5 sm:px-margin-edge py-section-v-md md:py-section-v-lg"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-col-gap items-center">
            <div className="lg:col-span-6">
              <SectionHeader eyebrow={section.eyebrow ?? undefined} title={section.title} onDark />
              {section.subtitle ? (
                <p className="font-body-md md:font-body-lg text-body-md md:text-body-lg text-white/70 max-w-lg mb-9">
                  {section.subtitle}
                </p>
              ) : null}
              {enlace && etiqueta ? (
                <Button href={enlace} variant="onDark" size="sm" icon={txt(config, 'cta_icon')}>
                  {etiqueta}
                </Button>
              ) : null}
            </div>
          </div>
        </section>
      )
    }

    default:
      // Tipo que este código no sabe pintar. Se descarta sin ruido: permite
      // sembrar una sección nueva antes de desplegar quien la dibuja.
      return null
  }
}
