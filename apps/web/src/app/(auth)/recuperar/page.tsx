import type { Metadata } from 'next'
import Link from 'next/link'

import { requestPasswordReset } from '@/actions/auth'
import { AuthForm } from '@/components/auth/AuthForm'
import { TextField } from '@/components/checkout/Field'

export const metadata: Metadata = {
  title: 'Recuperar contraseña',
  robots: { index: false },
}

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg mb-3">
        Recuperar contraseña
      </h1>
      <p className="font-body-md text-body-md text-secondary mb-8">
        Escribe tu correo y te mandamos un enlace para poner una contraseña nueva.
      </p>

      <AuthForm
        action={requestPasswordReset}
        submitLabel="Enviar enlace"
        pendingLabel="Enviando…"
        successTitle="Enlace enviado"
      >
        <TextField
          id="email"
          name="email"
          label="Correo electrónico"
          type="email"
          required
          autoComplete="email"
          autoFocus
        />
      </AuthForm>

      <p className="font-body-md text-body-md text-secondary mt-8 pt-8 border-t border-surface-variant">
        <Link href="/ingresar" className="text-primary underline underline-offset-4">
          Volver a iniciar sesión
        </Link>
      </p>
    </>
  )
}
