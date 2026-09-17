'use client'

import { useEffect, useState } from 'react'
import { Icon, cn } from '@lumane/ui-web'

import { signOut } from '@/actions/auth'

const SECTIONS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'pedidos', label: 'Mis pedidos' },
  { id: 'direcciones', label: 'Direcciones' },
  { id: 'datos', label: 'Datos personales' },
  { id: 'deseos', label: 'Lista de deseos' },
] as const

export interface AccountNavProps {
  initials: string
  fullName: string
  memberSinceYear: number
}

/**
 * Barra lateral de la cuenta.
 *
 * Todas las secciones viven en la misma página y se navegan por ancla, como en
 * el prototipo. Un `IntersectionObserver` marca la que está a la vista: el
 * `rootMargin` recorta la ventana a su banda central, así que la sección activa
 * es la que ocupa el centro de la pantalla y no la que apenas asoma por abajo.
 */
export function AccountNav({ initials, fullName, memberSinceYear }: AccountNavProps) {
  const [active, setActive] = useState<string>(SECTIONS[0].id)

  useEffect(() => {
    const elements = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => el !== null,
    )
    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id)
        }
      },
      { rootMargin: '-40% 0px -50% 0px' },
    )

    for (const el of elements) observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <aside className="lg:col-span-3 lg:sticky lg:top-[128px]">
      <div className="flex items-center gap-4 border-b border-primary pb-6 mb-6">
        <span
          aria-hidden="true"
          className="w-14 h-14 rounded-full bg-editorial-ink text-on-tertiary flex items-center justify-center font-headline-sm text-headline-sm flex-shrink-0"
        >
          {initials}
        </span>
        <div className="min-w-0">
          <p className="font-body-md text-body-md truncate">{fullName}</p>
          <p className="font-label-upper text-[10px] uppercase tracking-[0.16em] text-secondary mt-1">
            Clienta desde {memberSinceYear}
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-1 pl-4 font-body-md text-body-md">
        {SECTIONS.map((section) => {
          const isActive = active === section.id
          return (
            <li key={section.id} className="relative">
              {isActive ? (
                <span
                  aria-hidden="true"
                  className="absolute -left-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary"
                />
              ) : null}
              <a
                href={`#${section.id}`}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                  'block py-2.5 transition-colors',
                  isActive ? 'text-primary' : 'text-secondary hover:text-primary',
                )}
              >
                {section.label}
              </a>
            </li>
          )
        })}
      </ul>

      <form action={signOut}>
        <button
          type="submit"
          className="mt-6 flex items-center gap-2 py-2.5 pl-4 font-label-upper text-label-upper uppercase text-secondary hover:text-accent-red transition-colors"
        >
          <Icon name="logout" size={18} />
          Cerrar sesión
        </button>
      </form>
    </aside>
  )
}
