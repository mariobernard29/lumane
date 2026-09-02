import Image from 'next/image'

import type { ProductImage } from '@/lib/queries/product'

/**
 * Galería de la ficha.
 *
 * El prototipo simulaba "vistas de detalle" recortando la MISMA fotografía con
 * `transform: scale()`. Aquí no se falsean recortes: se muestran las imágenes
 * que la boutique haya subido de verdad. Con una sola foto, la ficha enseña una
 * sola foto —limpio— y en cuanto se suban más aparecen abajo sin tocar código.
 *
 * La principal NO va en blanco y negro: a diferencia de las tarjetas del
 * catálogo, aquí la clienta necesita ver el color real de la prenda.
 */
export function ProductGallery({ images, productName }: { images: ProductImage[]; productName: string }) {
  if (images.length === 0) {
    return (
      <div className="lg:col-span-7">
        <div className="aspect-[4/5] bg-editorial-ink border border-primary" />
      </div>
    )
  }

  const [main, ...rest] = images

  return (
    <div className="lg:col-span-7 flex flex-col gap-4">
      <figure className="relative overflow-hidden bg-editorial-ink border border-primary aspect-[4/5]">
        <Image
          src={main!.url}
          alt={main!.alt}
          fill
          priority
          sizes="(min-width: 1024px) 58vw, 100vw"
          className="hero-media hero-media--product object-cover"
        />
      </figure>

      {rest.length > 0 ? (
        <div className="grid grid-cols-2 gap-4">
          {rest.slice(0, 4).map((image) => (
            <figure
              key={image.storagePath}
              className="relative overflow-hidden bg-editorial-ink border border-primary aspect-[4/5]"
            >
              <Image
                src={image.url}
                alt={image.alt}
                fill
                sizes="(min-width: 1024px) 29vw, 50vw"
                className="object-cover"
              />
            </figure>
          ))}
        </div>
      ) : null}

      <p className="sr-only">
        {images.length === 1
          ? `Una fotografía de ${productName}.`
          : `${images.length} fotografías de ${productName}.`}
      </p>
    </div>
  )
}
