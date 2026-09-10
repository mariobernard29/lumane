import Image from 'next/image'
import Link from 'next/link'

import { Icon } from './Icon.tsx'

export interface FooterLink {
  id: string
  label: string
  href: string
}

export interface FooterColumn {
  key: string
  title: string
  links: FooterLink[]
}

export interface FooterProps {
  /** Columnas leídas de `navigation_menus` (`footer_tienda`, `footer_ayuda`, …). */
  columns: FooterColumn[]
  legalLinks: FooterLink[]
  logoUrl: string
  tagline?: string | null
  contactEmail?: string | null
  whatsappNumber?: string | null
  openingHours?: string | null
  socialLinks?: Record<string, string> | null
  copyright?: string | null
}

const SOCIAL_ICONS: Record<string, string> = {
  instagram: 'photo_camera',
  facebook: 'thumb_up',
  whatsapp: 'chat',
  tiktok: 'music_note',
}

/**
 * Pie de cinco columnas sobre negro.
 *
 * Todo su contenido —columnas, enlaces, contacto, redes y copyright— llega de
 * la base de datos. En el prototipo estaba escrito a mano y repetido en las
 * ocho páginas HTML, que es justo lo que este proyecto viene a eliminar.
 */
export function Footer({
  columns,
  legalLinks,
  logoUrl,
  tagline,
  contactEmail,
  whatsappNumber,
  openingHours,
  socialLinks,
  copyright,
}: FooterProps) {
  const socials = Object.entries(socialLinks ?? {})

  return (
    <footer className="bg-editorial-ink text-on-tertiary border-t border-on-primary-fixed-variant">
      <div className="px-5 sm:px-margin-edge py-section-v-md grid grid-cols-2 lg:grid-cols-12 gap-x-col-gap gap-y-12">
        <div className="col-span-2 lg:col-span-4">
          <Link href="/" aria-label="LUMANE, ir al inicio" className="inline-block mb-6">
            {/* El logotipo es negro; `brightness-0 invert` lo vuelve blanco sin
                necesidad de mantener una segunda versión del archivo. */}
            <Image
              src={logoUrl}
              alt="LUMANE"
              width={150}
              height={54}
              className="h-8 w-auto object-contain brightness-0 invert"
            />
          </Link>
          {tagline ? (
            <p className="font-body-md text-body-md text-white/60 max-w-xs mb-6">{tagline}</p>
          ) : null}
          {socials.length > 0 ? (
            <div className="flex items-center gap-5">
              {socials.map(([network, href]) => (
                <a
                  key={network}
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={network}
                  className="text-white/60 hover:text-white transition-colors"
                >
                  <Icon name={SOCIAL_ICONS[network] ?? 'link'} size={20} />
                </a>
              ))}
            </div>
          ) : null}
        </div>

        {columns.map((column) => (
          <div key={column.key} className="col-span-1 lg:col-span-2">
            <h3 className="font-label-upper text-label-upper uppercase mb-5">{column.title}</h3>
            <ul className="flex flex-col gap-3 font-body-md text-body-md text-white/60">
              {column.links.map((link) => (
                <li key={link.id}>
                  <Link href={link.href} className="hover:text-white transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="col-span-1 lg:col-span-2">
          <h3 className="font-label-upper text-label-upper uppercase mb-5">Contacto</h3>
          <ul className="flex flex-col gap-3 font-body-md text-body-md text-white/60">
            {contactEmail ? (
              <li>
                <a href={`mailto:${contactEmail}`} className="hover:text-white transition-colors">
                  {contactEmail}
                </a>
              </li>
            ) : null}
            {whatsappNumber ? (
              <li>
                <a
                  href={`https://wa.me/${whatsappNumber.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="hover:text-white transition-colors"
                >
                  WhatsApp {whatsappNumber}
                </a>
              </li>
            ) : null}
            {openingHours ? <li>{openingHours}</li> : null}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/15 px-5 sm:px-margin-edge py-6 flex flex-col md:flex-row items-center justify-between gap-3 font-label-upper text-[10px] uppercase tracking-[0.16em] text-white/50">
        <p>{copyright}</p>
        <ul className="flex items-center gap-6">
          {legalLinks.map((link) => (
            <li key={link.id}>
              <Link href={link.href} className="hover:text-white transition-colors">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  )
}
