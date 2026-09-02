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
 * boutique puede cambiar "Envío express sin costo desde $10,000" sin tocar el
 * código —y sin que quede desalineado con la regla real de envío gratis, que
 * vive en `store_settings`.
 */
export function ServicesBar({ items }: { items: ServiceItem[] }) {
  if (items.length === 0) return null

  return (
    <section aria-label="Servicios LUMANE" className="bg-editorial-ink text-on-tertiary">
      <ul className="px-5 sm:px-margin-edge py-5 grid grid-cols-2 lg:grid-cols-4 gap-y-4 gap-x-6 text-center lg:text-left">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-3 justify-center lg:justify-start">
            <Icon name={item.icon} size={20} className="text-white" />
            <span className="font-label-upper text-label-upper uppercase">{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
