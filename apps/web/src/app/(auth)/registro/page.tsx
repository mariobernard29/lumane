import type { Metadata } from 'next'
import Link from 'next/link'

import { signUp } from '@/actions/auth'
import { AuthForm } from '@/components/auth/AuthForm'
import { TextField } from '@/components/checkout/Field'

export const metadata: Metadata = {
  title: 'Crear cuenta',
  robots: { index: false },
}

export default function SignUpPage() {
  return (
    <>
      <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg mb-3">
        Crear cuenta
      </h1>
      <p className="font-body-md text-body-md text-secondary mb-8">
        Guarda tus direcciones, sigue tus pedidos y arma tu lista de deseos.
      </p>

      <AuthForm action={signUp} submitLabel="Crear cuenta" pendingLabel="Creando…">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <TextField
            id="firstName"
            name="firstName"
            label="Nombre"
            required
            autoComplete="given-name"
            autoFocus
          />
          <TextField
            id="lastName"
            name="lastName"
            label="Apellidos"
            autoComplete="family-name"
          />
        </div>

        <TextField
          id="email"
          name="email"
          label="Correo electrónico"
          type="email"
          required
          autoComplete="email"
          hint="Si ya compraste en la boutique, usa el mismo correo y tu historial aparecerá aquí."
        />

        <TextField
          id="password"
          name="password"
          label="Contraseña"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          hint="Al menos 8 caracteres."
        />

        <label className="flex items-start gap-3 cursor-pointer font-body-md text-body-md text-secondary">
          <input
            type="checkbox"
            name="acceptsMarketing"
            className="w-4 h-4 mt-1 border-outline text-primary focus:ring-0 focus:ring-offset-0"
          />
          Quiero recibir novedades y acceso anticipado de LUMANE.
        </label>

        <p className="font-body-md text-[13px] text-text-muted">
          Al crear tu cuenta aceptas los{' '}
          <Link href="/p/terminos" className="underline underline-offset-4">
            términos
          </Link>{' '}
          y el{' '}
          <Link href="/p/privacidad" className="underline underline-offset-4">
            aviso de privacidad
          </Link>
          .
        </p>
      </AuthForm>

      <p className="font-body-md text-body-md text-secondary mt-8 pt-8 border-t border-surface-variant">
        ¿Ya tienes cuenta?{' '}
        <Link href="/ingresar" className="text-primary underline underline-offset-4">
          Inicia sesión
        </Link>
      </p>
    </>
  )
}
