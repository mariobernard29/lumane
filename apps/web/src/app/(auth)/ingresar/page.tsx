import type { Metadata } from 'next'
import Link from 'next/link'

import { signIn } from '@/actions/auth'
import { AuthForm } from '@/components/auth/AuthForm'
import { TextField } from '@/components/checkout/Field'

export const metadata: Metadata = {
  title: 'Iniciar sesión',
  robots: { index: false },
}

const LINK_ERRORS: Record<string, string> = {
  'enlace-invalido': 'Ese enlace no es válido. Pide uno nuevo.',
  'enlace-caducado': 'Ese enlace ya caducó. Pide uno nuevo.',
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; error?: string }>
}) {
  const { redirect: redirectTo, error } = await searchParams
  const linkError = error ? LINK_ERRORS[error] : null

  return (
    <>
      <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg mb-3">
        Iniciar sesión
      </h1>
      <p className="font-body-md text-body-md text-secondary mb-8">
        Entra para ver tus pedidos, tus direcciones y tu lista de deseos.
      </p>

      {linkError ? (
        <p role="alert" className="border border-primary p-4 font-body-md text-[13px] mb-8">
          {linkError}
        </p>
      ) : null}

      <AuthForm action={signIn} submitLabel="Entrar" pendingLabel="Entrando…">
        {/* El destino viaja en el formulario para devolver a la clienta a donde
            iba. `safeRedirect` en la acción descarta cualquier URL externa. */}
        {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}

        <TextField
          id="email"
          name="email"
          label="Correo electrónico"
          type="email"
          required
          autoComplete="email"
          autoFocus
        />
        <TextField
          id="password"
          name="password"
          label="Contraseña"
          type="password"
          required
          autoComplete="current-password"
        />
        <Link
          href="/recuperar"
          className="font-label-upper text-label-upper uppercase underline underline-offset-4 text-secondary hover:text-accent-red transition-colors -mt-2 w-max"
        >
          Olvidé mi contraseña
        </Link>
      </AuthForm>

      <p className="font-body-md text-body-md text-secondary mt-8 pt-8 border-t border-surface-variant">
        ¿Primera vez en Lumane?{' '}
        <Link href="/registro" className="text-primary underline underline-offset-4">
          Crea tu cuenta
        </Link>
      </p>
    </>
  )
}
