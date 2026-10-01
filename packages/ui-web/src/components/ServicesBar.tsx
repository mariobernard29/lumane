import { Icon } from './Icon.tsx'

export interface ServiceItem {
  icon: string
  label: string
}

/**
 * Franja negra de servicios, justo debajo de la portada.
 *
 * El prototipo no tiene marquesina ni barra de anuncios animada: este bloque
 * estático es su equivalente. Los textos vienen del administrador, así que la
 * boutique puede cambiar "Envío sin costo desde $2,499" sin tocar el código
 * —pero la cifra tiene que coincidir con la regla real de envío gratis, que
 * vive en `store_settings.free_shipping_over_cents`.
 *
 * Cada servicio va CENTRADO en su columna, no pegado a la izquierda. Los
 * textos los escribe el administrador y nunca miden lo mismo: alineados a la
 * izquierda en columnas iguales, el hueco tras uno corto es tres veces el que
 * deja uno largo, y el bloque entero queda corrido hacia la izquierda.
 *
 * En móvil el icono va ENCIMA del texto. Con dos columnas de ~160 px los
 * textos parten en dos o tres líneas, y al lado del icono cada fila quedaba
 * dentada; apilados, los iconos de una fila caen a la misma altura.
 */
export function ServicesBar({ items }: { items: ServiceItem[] }) {
  if (items.length === 0) return null

  return (
    <section aria-label="Servicios LUMANE" className="bg-editorial-ink text-on-tertiary">
      <ul className="px-5 sm:px-margin-edge py-6 lg:py-5 grid grid-cols-2 lg:grid-cols-4 gap-y-6 gap-x-4 lg:gap-x-6">
        {items.map((item) => (
          <li
            key={item.label}
            className="flex flex-col items-center gap-2 text-center lg:flex-row lg:justify-center lg:gap-3 lg:text-left"
          >
            <Icon name={item.icon} size={20} className="text-white shrink-0" />
            <span className="font-label-upper text-label-upper uppercase text-balance">{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
