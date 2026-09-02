import { cn } from '../lib/cn.ts'
import { SectionHeader } from './SectionHeader.tsx'

export interface NewsletterProps {
  eyebrow?: string | null
  title: string
  body?: string | null
  disclaimer?: string | null
  /** Sobre negro en la portada y en /rebajas; sobre blanco en /colecciones. */
  tone?: 'light' | 'dark'
  /** Server Action que da de alta el correo en `newsletter_subscribers`. */
  action: (formData: FormData) => void | Promise<void>
}

/**
 * Bloque de boletín. Existe en dos tonos porque el prototipo lo usa sobre
 * fondo claro y sobre fondo negro según la página, con el mismo contenido.
 *
 * El input es de solo borde inferior (`focus-within` lo enciende), como todos
 * los formularios del sistema.
 */
export function Newsletter({
  eyebrow,
  title,
  body,
  disclaimer,
  tone = 'dark',
  action,
}: NewsletterProps) {
  const isDark = tone === 'dark'

  return (
    <section
      className={cn(
        'px-5 sm:px-margin-edge py-section-v-md',
        isDark ? 'bg-editorial-ink text-on-tertiary' : 'bg-paper-bright text-primary',
      )}
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-col-gap items-end">
        <div className="lg:col-span-6">
          <SectionHeader eyebrow={eyebrow} title={title} onDark={isDark} className="mb-6" />
          {body ? (
            <p
              className={cn(
                'font-body-md text-body-md max-w-md',
                isDark ? 'text-white/70' : 'text-secondary',
              )}
            >
              {body}
            </p>
          ) : null}
        </div>

        <form action={action} className="lg:col-span-6 lg:col-start-7 mt-8 lg:mt-0">
          <div
            className={cn(
              'flex items-center border-b pb-3 transition-colors',
              isDark
                ? 'border-on-primary-fixed-variant focus-within:border-white'
                : 'border-surface-variant focus-within:border-primary',
            )}
          >
            <label className="sr-only" htmlFor="boletin-email">
              Correo electrónico
            </label>
            <input
              id="boletin-email"
              name="email"
              type="email"
              required
              placeholder="tu@correo.com"
              className={cn(
                'flex-grow bg-transparent border-none focus:ring-0 p-0 font-body-md text-body-md outline-none',
                isDark ? 'text-white placeholder:text-white/40' : 'text-primary placeholder:text-outline-variant',
              )}
            />
            <button
              type="submit"
              className={cn(
                'font-label-upper text-label-upper uppercase whitespace-nowrap ml-4 transition-colors',
                isDark ? 'text-white hover:text-white/60' : 'text-primary hover:text-accent-red',
              )}
            >
              Suscribirme
            </button>
          </div>
          {disclaimer ? (
            <p
              className={cn(
                'font-body-md text-[13px] mt-4',
                isDark ? 'text-white/40' : 'text-text-muted',
              )}
            >
              {disclaimer}
            </p>
          ) : null}
        </form>
      </div>
    </section>
  )
}
