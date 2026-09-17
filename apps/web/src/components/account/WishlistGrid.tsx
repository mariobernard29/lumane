'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Badge, Button, EmptyState, Icon, cn, formatPrice } from '@lumane/ui-web'

import { removeFromWishlist } from '@/actions/account'
import type { WishlistItem } from '@/lib/queries/account'

/**
 * Lista de deseos.
 *
 * Usa la misma tarjeta del catálogo (blanco y negro que gana color al pasar el
 * cursor) con un botón de quitar encima, como en el prototipo. La pieza se
 * retira de la vista al instante y solo vuelve si el servidor rechaza la
 * operación.
 *
 * A diferencia del prototipo, muestra si la pieza sigue disponible: una lista
 * de deseos llena de cosas agotadas no sirve para decidir.
 */
export function WishlistGrid({ items }: { items: WishlistItem[] }) {
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const visible = items.filter((item) => !removed.has(item.productId))

  if (visible.length === 0) {
    return (
      <EmptyState
        icon="favorite"
        title="Tu lista de deseos está vacía"
        body="Guarda las piezas que te gusten desde su ficha y las encontrarás aquí."
        action={
          <Button href="/catalogo" variant="outline" size="md">
            Ver el catálogo
          </Button>
        }
      />
    )
  }

  function remove(productId: string) {
    setRemoved((current) => new Set(current).add(productId))
    startTransition(async () => {
      const result = await removeFromWishlist(productId)
      if (!result.ok) {
        setRemoved((current) => {
          const next = new Set(current)
          next.delete(productId)
          return next
        })
      }
    })
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 md:gap-x-col-gap gap-y-10">
      {visible.map((item) => (
        <div key={item.productId} className="p-card block group relative">
          <button
            type="button"
            aria-label={`Quitar ${item.name} de la lista de deseos`}
            disabled={isPending}
            onClick={() => remove(item.productId)}
            className={cn(
              'absolute top-3 right-3 z-20 w-8 h-8 bg-paper-bright border border-primary',
              'flex items-center justify-center hover:bg-primary hover:text-on-primary transition-colors',
            )}
          >
            <Icon name="favorite" size={16} filled />
          </button>

          <Link href={`/producto/${item.slug}`} className="block">
            <div className="p-frame aspect-[3/4] border border-primary">
              <Image
                src={item.imageUrl}
                alt={item.imageAlt}
                fill
                sizes="(min-width: 768px) 25vw, 50vw"
                className="p-media"
              />

              {item.available <= 0 ? (
                <span className="absolute top-4 left-4 z-10">
                  <Badge variant="outline">Agotado</Badge>
                </span>
              ) : null}

              <div className="p-caption p-3 md:p-5 flex flex-col md:flex-row md:items-end md:justify-between gap-1 md:gap-3">
                <span className="p-rule" />
                <p className="font-label-upper text-[10px] md:text-label-upper uppercase tracking-[0.14em] leading-snug">
                  {item.name}
                </p>
                {item.compareAtPriceCents ? (
                  <span className="flex flex-col items-end whitespace-nowrap">
                    <span className="font-price text-[11px] text-white/50 line-through">
                      {formatPrice(item.compareAtPriceCents)}
                    </span>
                    <span className="font-price text-[13px] md:text-price">
                      {formatPrice(item.priceCents)}
                    </span>
                  </span>
                ) : (
                  <span className="font-price text-[13px] md:text-price whitespace-nowrap">
                    {formatPrice(item.priceCents)}
                  </span>
                )}
              </div>
            </div>
          </Link>
        </div>
      ))}
    </div>
  )
}
