'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { cn } from '../lib/cn.ts'

export interface SortOption {
  value: string
  label: string
  /**
   * URL ya construida para este orden.
   *
   * No se recibe una función `buildHref`: las funciones no cruzan la frontera
   * servidor→cliente en React Server Components. La página, que sí conoce la
   * ruta y los filtros activos, calcula las URLs y aquí solo se navega.
   */
  href: string
}

export interface SortSelectProps {
  options: SortOption[]
  value: string
  label?: string
}

/**
 * Selector de ordenamiento.
 *
 * Es el único control del catálogo que necesita JavaScript: un `<select>` no
 * navega solo. Los filtros son enlaces y funcionan sin él.
 *
 * `useTransition` mantiene el desplegable utilizable mientras llega la página
 * nueva en lugar de congelarlo, y `aria-busy` se lo cuenta a los lectores de
 * pantalla.
 */
export function SortSelect({ options, value, label = 'Ordenar' }: SortSelectProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex items-center gap-2" aria-busy={isPending}>
      <label className="font-label-upper text-label-upper uppercase text-secondary" htmlFor="orden">
        {label}
      </label>
      <select
        id="orden"
        value={value}
        onChange={(event) => {
          const target = options.find((option) => option.value === event.target.value)
          if (!target) return
          startTransition(() => router.push(target.href, { scroll: false }))
        }}
        className={cn(
          'bg-transparent border-0 border-b border-primary focus:ring-0 focus:outline-none',
          'font-nav-link text-nav-link uppercase text-primary py-1 pl-0 pr-7 cursor-pointer',
          isPending && 'opacity-60',
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}
