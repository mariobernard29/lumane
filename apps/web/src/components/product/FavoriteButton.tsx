'use client'

import { useState, useTransition } from 'react'
import { Icon, cn } from '@lumane/ui-web'

import { toggleFavorite } from '@/actions/favorites'

/**
 * "Guardar en favoritos".
 *
 * Para una visita sin cuenta no desaparece ni lleva a un formulario de golpe:
 * explica en una línea qué falta. Esconder el botón dejaría la ficha distinta
 * según quién mire, y mandar a iniciar sesión sin avisar pierde la pieza que
 * estaba viendo.
 */
export function FavoriteButton({
  productId,
  initialIsFavorite = false,
}: {
  productId: string
  initialIsFavorite?: boolean
}) {
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <div className="mb-8">
      <button
        type="button"
        aria-pressed={isFavorite}
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await toggleFavorite({ productId })
            if (result.ok) {
              setIsFavorite(Boolean(result.isFavorite))
              setNotice(null)
            } else {
              setNotice(result.message ?? 'No se pudo guardar')
            }
          })
        }
        className={cn(
          'w-full border h-12 flex items-center justify-center gap-2',
          'font-label-upper text-label-upper uppercase transition-colors',
          isFavorite
            ? 'border-primary text-primary'
            : 'border-outline-variant text-secondary hover:border-primary hover:text-primary',
        )}
      >
        <Icon name="favorite" size={18} filled={isFavorite} />
        {isFavorite ? 'Guardado en favoritos' : 'Guardar en favoritos'}
      </button>

      {notice ? (
        <p role="status" className="font-body-md text-[13px] text-text-muted mt-2">
          {notice}
        </p>
      ) : null}
    </div>
  )
}
