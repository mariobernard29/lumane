import Image from 'next/image'
import Link from 'next/link'
import { Icon } from '@lumane/ui-web'

/**
 * Marco del checkout.
 *
 * Vive fuera del grupo `(storefront)` a propósito: aquí NO hay buscador, ni
 * menú de categorías, ni icono de bolsa. Cada uno de esos enlaces es una
 * invitación a abandonar el pago justo cuando ya se decidió comprar. El
 * prototipo hace lo mismo.
 *
 * Solo quedan tres cosas: volver a la tienda, el logotipo y la promesa de que
 * la conexión es segura.
 */
export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="w-full bg-paper-bright border-b border-primary">
        <div className="relative flex items-center justify-between h-16 px-5 sm:px-margin-edge">
          <Link
            href="/carrito"
            className="font-label-upper text-[10px] uppercase tracking-[0.16em] text-secondary hover:text-accent-red transition-colors flex items-center gap-2"
          >
            <Icon name="arrow_back" size={16} />
            <span className="hidden sm:inline">Volver a la bolsa</span>
          </Link>

          <Link
            href="/"
            aria-label="LUMANE, ir al inicio"
            className="absolute left-1/2 -translate-x-1/2 flex items-center"
          >
            <Image
              src="/logo-lumane.png"
              alt="LUMANE"
              width={150}
              height={54}
              priority
              className="h-7 md:h-8 w-auto object-contain"
            />
          </Link>

          <span className="font-label-upper text-[10px] uppercase tracking-[0.16em] text-secondary flex items-center gap-2">
            <Icon name="lock" size={16} />
            <span className="hidden sm:inline">Pago seguro</span>
          </span>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-surface-variant px-5 sm:px-margin-edge py-8 flex flex-col md:flex-row items-center justify-between gap-4 font-label-upper text-[10px] uppercase tracking-[0.16em] text-secondary">
        <p>© 2026 LUMANE</p>
        <ul className="flex items-center gap-6">
          <li>
            <Link href="/p/envios-y-devoluciones" className="hover:text-primary transition-colors">
              Envíos y devoluciones
            </Link>
          </li>
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
        </ul>
      </footer>
    </>
  )
}
