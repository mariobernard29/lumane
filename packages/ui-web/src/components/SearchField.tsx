import Link from 'next/link'

import { Icon } from './Icon.tsx'

export interface SearchFieldProps {
  /** Ruta a la que se envía la búsqueda. El campo viaja como `?q=`. */
  action: string
  /** Lo tecleado en la búsqueda actual, para que el campo no se vacíe al volver. */
  value?: string | null
  label?: string
  placeholder?: string
}

/**
 * El buscador grande de `/buscar`: el campo ES el titular de la página, en
 * tipografía de display.
 *
 * Es un `<form method="get">` sin una línea de JavaScript. La consecuencia es
 * que la búsqueda funciona con el navegador apagado a la mitad, que el
 * resultado tiene una URL que se puede compartir por WhatsApp, y que el botón
 * "atrás" devuelve a la búsqueda anterior en lugar de a la página en blanco.
 *
 * Por lo mismo, limpiar es un enlace a la ruta sin parámetros y no un botón
 * que vacíe el campo: deja la URL y la pantalla diciendo lo mismo.
 */
export function SearchField({
  action,
  value,
  label = 'Buscar productos, categorías o inspiración',
  placeholder = 'Buscar…',
}: SearchFieldProps) {
  return (
    <form
      action={action}
      method="get"
      role="search"
      className="flex items-end gap-4 border-b-2 border-primary pb-4"
    >
      <button
        type="submit"
        aria-label="Buscar"
        className="mb-1 text-secondary hover:text-accent-red transition-colors"
      >
        <Icon name="search" size={null} className="text-[28px] md:text-[36px]" />
      </button>

      <label className="sr-only" htmlFor="q">
        {label}
      </label>
      <input
        id="q"
        name="q"
        type="search"
        defaultValue={value ?? ''}
        placeholder={placeholder}
        autoComplete="off"
        // `autoFocus` a propósito: a esta página solo se llega pulsando la lupa,
        // y quien la pulsa viene a escribir.
        autoFocus
        className="search-input flex-grow min-w-0 font-display-xl-mobile md:font-display-xl text-display-xl-mobile md:text-display-xl text-primary placeholder:text-outline-variant"
      />

      {value ? (
        <Link
          href={action}
          aria-label="Limpiar búsqueda"
          className="mb-2 md:mb-4 text-secondary hover:text-accent-red transition-colors"
        >
          <Icon name="close" size={22} />
        </Link>
      ) : null}
    </form>
  )
}
