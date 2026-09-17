import Image from 'next/image'
import Link from 'next/link'

/**
 * Marco de las pantallas de acceso.
 *
 * El prototipo no tenía ninguna: modelaba la cuenta ya iniciada y nunca el
 * momento de entrar. Se diseñan con el mismo lenguaje —radio cero, campos de
 * solo borde inferior, tipografía en mayúsculas— sobre una columna estrecha y
 * sin navegación: aquí solo hay una cosa que hacer.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-primary bg-paper-bright">
        <div className="h-16 flex items-center justify-center px-5">
          <Link href="/" aria-label="LUMANE, ir al inicio">
            <Image
              src="/logo-lumane.png"
              alt="LUMANE"
              width={150}
              height={54}
              priority
              className="h-7 md:h-8 w-auto object-contain"
            />
          </Link>
        </div>
      </header>

      <main className="flex-grow flex items-start justify-center px-5 py-section-v-md">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="border-t border-surface-variant px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 font-label-upper text-[10px] uppercase tracking-[0.16em] text-secondary">
        <p>© 2026 LUMANE</p>
        <ul className="flex items-center gap-6">
          <li>
            <Link href="/p/privacidad" className="hover:text-primary transition-colors">
              Privacidad
            </Link>
          </li>
          <li>
            <Link href="/p/terminos" className="hover:text-primary transition-colors">
              Términos
            </Link>
          </li>
          <li>
            <Link href="/catalogo" className="hover:text-primary transition-colors">
              Seguir comprando
            </Link>
          </li>
        </ul>
      </footer>
    </div>
  )
}
