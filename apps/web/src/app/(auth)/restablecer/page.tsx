import type { Metadata } from 'next'

import { updatePassword } from '@/actions/auth'
import { AuthForm } from '@/components/auth/AuthForm'
import { TextField } from '@/components/checkout/Field'

export const metadata: Metadata = {
  title: 'Nueva contraseña',
  robots: { index: false },
}

/**
 * Nueva contraseña.
 *
 * Solo se llega aquí desde el enlace del correo, que ya dejó una sesión válida
 * al pasar por `/auth/confirm`. Sin esa sesión el middleware no protege esta
 * ruta —no empieza por `/cuenta`—, pero `updateUser` falla sin usuario y el
 * mensaje invita a pedir un enlace nuevo, que es lo único que puede hacer.
 */
export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg mb-3">
        Nueva contraseña
      </h1>
      <p className="font-body-md text-body-md text-secondary mb-8">
        Elige una contraseña nueva para tu cuenta.
      </p>

      <AuthForm action={updatePassword} submitLabel="Guardar contraseña" pendingLabel="Guardando…">
        <TextField
          id="password"
          name="password"
          label="Contraseña nueva"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          autoFocus
          hint="Al menos 8 caracteres."
        />
        <TextField
          id="confirm"
          name="confirm"
          label="Repite la contraseña"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </AuthForm>
    </>
  )
}
