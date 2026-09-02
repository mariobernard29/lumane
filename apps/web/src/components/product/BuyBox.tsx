'use client'

import { useMemo, useState, useTransition } from 'react'
import { Button, Icon, cn, formatPrice } from '@lumane/ui-web'

import { addToCart } from '@/actions/cart'
import type { ProductOption, ProductVariant } from '@/lib/queries/product'

interface BuyBoxProps {
  productName: string
  options: ProductOption[]
  variants: ProductVariant[]
  sizeGuideHref?: string | null
  /** Nota del prototipo: "La modelo mide 1.75 m y usa talla 38." */
  fitNote?: string | null
}

/**
 * Selección de variante y alta en la bolsa.
 *
 * Es el único bloque de cliente de la ficha, porque elegir talla y cantidad es
 * interacción pura. Todo lo demás —galería, acordeones, reseñas— se renderiza
 * en el servidor.
 *
 * El stock que se ve aquí es el del momento en que se cargó la página. La
 * verdad la dice `add_cart_line` al pulsar: si alguien compró la última pieza
 * en el mostrador mientras la clienta decidía, el RPC lo rechaza y el mensaje
 * de error viene ya redactado desde la base.
 */
export function BuyBox({ productName, options, variants, sizeGuideHref, fitNote }: BuyBoxProps) {
  const [selection, setSelection] = useState<Record<string, string>>(() => firstAvailable(options, variants))
  const [quantity, setQuantity] = useState(1)
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedVariant = useMemo(
    () => findVariant(variants, selection, options),
    [variants, selection, options],
  )

  const maxQuantity = Math.min(selectedVariant?.available ?? 0, 20)
  const canBuy = Boolean(selectedVariant) && maxQuantity > 0

  function choose(optionId: string, valueId: string) {
    setSelection((current) => ({ ...current, [optionId]: valueId }))
    setQuantity(1)
    setFeedback(null)
  }

  function submit() {
    if (!selectedVariant) {
      setFeedback({ ok: false, message: 'Elige una talla para continuar' })
      return
    }
    startTransition(async () => {
      const result = await addToCart({ variantId: selectedVariant.id, quantity })
      setFeedback({
        ok: result.ok,
        message: result.ok ? `${productName} está en tu bolsa` : (result.message ?? 'No se pudo agregar'),
      })
    })
  }

  return (
    <div>
      {options.map((option) => {
        const isColor = option.name.toLowerCase() === 'color'
        const selectedValue = option.values.find((v) => v.id === selection[option.id])

        return (
          <div key={option.id} className="border-t border-primary pt-6 mb-8">
            <div className="flex items-end justify-between mb-4">
              <p className="font-label-upper text-label-upper uppercase">
                {option.name}:
                <span className="text-secondary ml-1 normal-case tracking-normal">
                  {selectedValue?.value ?? '—'}
                </span>
              </p>
              {!isColor && sizeGuideHref ? (
                <a
                  href={sizeGuideHref}
                  className="font-label-upper text-[10px] uppercase tracking-[0.16em] text-secondary underline underline-offset-4 hover:text-accent-red transition-colors"
                >
                  Guía de tallas
                </a>
              ) : null}
            </div>

            {isColor ? (
              <div className="flex gap-3">
                {option.values.map((value) => {
                  const stock = stockFor(variants, options, selection, option.id, value.id)
                  const isSelected = selection[option.id] === value.id
                  return (
                    <button
                      key={value.id}
                      type="button"
                      aria-label={`Color ${value.value}${stock === 0 ? ', agotado' : ''}`}
                      aria-pressed={isSelected}
                      title={stock === 0 ? 'Agotado' : value.value}
                      disabled={stock === 0}
                      onClick={() => choose(option.id, value.id)}
                      style={{ backgroundColor: value.hex ?? '#E2E2E2' }}
                      className={cn(
                        'w-8 h-8 rounded-full border border-outline transition-all',
                        isSelected && 'ring-1 ring-offset-2 ring-primary',
                        stock === 0 && 'opacity-40 cursor-not-allowed',
                      )}
                    />
                  )
                })}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {option.values.map((value) => {
                  const stock = stockFor(variants, options, selection, option.id, value.id)
                  const isSelected = selection[option.id] === value.id
                  const isOut = stock === 0
                  return (
                    <button
                      key={value.id}
                      type="button"
                      disabled={isOut}
                      title={isOut ? 'Agotado' : undefined}
                      aria-pressed={isSelected}
                      onClick={() => choose(option.id, value.id)}
                      className={cn(
                        'py-3.5 font-nav-link text-nav-link transition-colors',
                        isOut
                          ? 'border border-outline-variant text-outline line-through cursor-not-allowed'
                          : isSelected
                            ? 'border-2 border-primary bg-primary text-on-primary'
                            : 'border border-primary hover:bg-primary hover:text-on-primary',
                      )}
                    >
                      {value.value}
                    </button>
                  )
                })}
              </div>
            )}

            {!isColor && fitNote ? (
              <p className="font-body-md text-[13px] text-text-muted mt-3">{fitNote}</p>
            ) : null}
          </div>
        )
      })}

      {selectedVariant && selectedVariant.available > 0 && selectedVariant.available <= 3 ? (
        <p className="font-label-upper text-label-upper uppercase text-accent-red mb-4">
          {selectedVariant.available === 1
            ? 'Última pieza disponible'
            : `Solo quedan ${selectedVariant.available} piezas`}
        </p>
      ) : null}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex items-center border border-primary h-16 sm:h-14 w-full sm:w-32 justify-between px-4">
          <button
            type="button"
            aria-label="Disminuir cantidad"
            disabled={quantity <= 1}
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="hover:text-accent-red transition-colors disabled:text-outline-variant disabled:cursor-not-allowed"
          >
            <Icon name="remove" size={18} />
          </button>
          <span className="font-nav-link text-nav-link" aria-live="polite">
            {quantity}
          </span>
          <button
            type="button"
            aria-label="Aumentar cantidad"
            disabled={quantity >= maxQuantity}
            onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
            className="hover:text-accent-red transition-colors disabled:text-outline-variant disabled:cursor-not-allowed"
          >
            <Icon name="add" size={18} />
          </button>
        </div>

        <Button
          variant="solid"
          onClick={submit}
          disabled={!canBuy || isPending}
          className="w-full sm:flex-1 h-16 sm:h-14 disabled:bg-surface-variant disabled:text-outline disabled:border-surface-variant disabled:cursor-not-allowed"
          icon={canBuy ? 'east' : undefined}
        >
          {isPending
            ? 'Agregando…'
            : canBuy
              ? `Añadir a la bolsa · ${formatPrice(selectedVariant!.priceCents)}`
              : 'Agotado'}
        </Button>
      </div>

      {feedback ? (
        <p
          role="status"
          className={cn(
            'font-body-md text-[13px] mb-4',
            feedback.ok ? 'text-secondary' : 'text-accent-red',
          )}
        >
          {feedback.message}
          {feedback.ok ? (
            <>
              {' · '}
              <a href="/carrito" className="underline underline-offset-4">
                Ver la bolsa
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}

/** Combinación inicial: la primera que tenga existencias, o la primera a secas. */
function firstAvailable(
  options: ProductOption[],
  variants: ProductVariant[],
): Record<string, string> {
  const inStock = variants.find((v) => v.available > 0) ?? variants[0]
  if (!inStock) return {}

  const selection: Record<string, string> = {}
  for (const option of options) {
    const match = option.values.find((value) => inStock.optionValueIds.includes(value.id))
    if (match) selection[option.id] = match.id
  }
  return selection
}

/** La variante que corresponde a la combinación elegida. */
function findVariant(
  variants: ProductVariant[],
  selection: Record<string, string>,
  options: ProductOption[],
): ProductVariant | undefined {
  const chosen = options.map((o) => selection[o.id]).filter(Boolean) as string[]
  if (chosen.length !== options.length) return undefined
  return variants.find((v) => chosen.every((id) => v.optionValueIds.includes(id)))
}

/**
 * Existencias de un valor concreto MANTENIENDO el resto de la selección.
 *
 * Es lo que permite tachar "M" cuando esa talla está agotada en el color
 * elegido, sin tacharla en los demás.
 */
function stockFor(
  variants: ProductVariant[],
  options: ProductOption[],
  selection: Record<string, string>,
  optionId: string,
  valueId: string,
): number {
  const hypothetical = { ...selection, [optionId]: valueId }
  const chosen = options.map((o) => hypothetical[o.id]).filter(Boolean) as string[]

  return variants
    .filter((v) => chosen.every((id) => v.optionValueIds.includes(id)))
    .reduce((sum, v) => sum + v.available, 0)
}
