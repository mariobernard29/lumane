'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Icon, cn, formatPrice } from '@lumane/ui-web'

import { setCartLineQuantity } from '@/actions/cart'
import type { CartLine } from '@/lib/queries/cart'

/**
 * Una línea de la bolsa, con su control de cantidad.
 *
 * Es de cliente porque los botones + / − deben responder al instante. La
 * cantidad nueva se pinta de forma optimista y, si el servidor la rechaza
 * —alguien compró la última pieza en el mostrador—, vuelve al valor anterior
 * y aparece el motivo. Nunca se queda mostrando una cantidad que la base no
 * aceptó.
 */
export function CartLineRow({ line }: { line: CartLine }) {
  const [quantity, setQuantity] = useState(line.quantity)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isUnavailable = line.available <= 0
  const exceedsStock = line.quantity > line.available && line.available > 0

  function change(next: number) {
    const previous = quantity
    setQuantity(next)
    setError(null)

    startTransition(async () => {
      const result = await setCartLineQuantity({ variantId: line.variantId, quantity: next })
      if (!result.ok) {
        setQuantity(previous)
        setError(result.message ?? 'No se pudo actualizar')
      }
    })
  }

  return (
    <li className={cn('py-6 flex gap-5', isPending && 'opacity-60')}>
      <Link
        href={`/producto/${line.productSlug}`}
        className="relative w-24 h-32 flex-shrink-0 overflow-hidden border border-surface-variant bg-editorial-ink"
      >
        <Image
          src={line.imageUrl}
          alt={line.productName}
          fill
          sizes="96px"
          className="object-cover"
        />
      </Link>

      <div className="flex-grow flex flex-col justify-between min-w-0">
        <div>
          <div className="flex items-start justify-between gap-4">
            <Link
              href={`/producto/${line.productSlug}`}
              className="font-body-md text-body-md hover:text-accent-red transition-colors"
            >
              {line.productName}
            </Link>
            <button
              type="button"
              aria-label={`Quitar ${line.productName} de la bolsa`}
              onClick={() => change(0)}
              className="text-secondary hover:text-accent-red transition-colors flex-shrink-0"
            >
              <Icon name="close" size={18} />
            </button>
          </div>

          <p className="font-label-upper text-label-upper uppercase text-secondary mt-1">
            {line.variantTitle ? `Talla ${line.variantTitle} · ` : ''}
            SKU {line.sku}
          </p>

          {isUnavailable ? (
            <p className="font-label-upper text-label-upper uppercase text-accent-red mt-2">
              Se agotó · quítala para continuar
            </p>
          ) : exceedsStock ? (
            <p className="font-label-upper text-label-upper uppercase text-accent-red mt-2">
              Solo quedan {line.available}
            </p>
          ) : null}

          {error ? (
            <p role="status" className="font-body-md text-[13px] text-accent-red mt-2">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex items-end justify-between gap-4 mt-4">
          <div className="flex items-center border border-primary h-11 w-28 justify-between px-3">
            <button
              type="button"
              aria-label="Disminuir cantidad"
              disabled={quantity <= 1 || isPending}
              onClick={() => change(quantity - 1)}
              className="hover:text-accent-red transition-colors disabled:text-outline-variant disabled:cursor-not-allowed"
            >
              <Icon name="remove" size={16} />
            </button>
            <span className="font-nav-link text-nav-link">{quantity}</span>
            <button
              type="button"
              aria-label="Aumentar cantidad"
              disabled={quantity >= line.available || isPending}
              onClick={() => change(quantity + 1)}
              className="hover:text-accent-red transition-colors disabled:text-outline-variant disabled:cursor-not-allowed"
            >
              <Icon name="add" size={16} />
            </button>
          </div>

          <span className="flex flex-col items-end whitespace-nowrap">
            {line.compareAtPriceCents ? (
              <span className="font-price text-[11px] text-text-muted line-through">
                {formatPrice(line.compareAtPriceCents * line.quantity)}
              </span>
            ) : null}
            <span className="font-price text-price">{formatPrice(line.lineTotalCents)}</span>
          </span>
        </div>
      </div>
    </li>
  )
}
