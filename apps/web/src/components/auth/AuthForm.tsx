'use client'

import { useActionState } from 'react'
import { Button, cn } from '@lumane/ui-web'

import type { AuthResult } from '@/actions/auth'

export interface AuthFormProps {
  action: (formData: FormData) => Promise<AuthResult>
  submitLabel: string
  pendingLabel: string
  children: React.ReactNode
  /** Mensaje de éxito cuando la acción no redirige (recuperar contraseña). */
  successTitle?: string
}

/**
 * Formulario de acceso.
 *
 * `useActionState` conserva el mensaje del servidor tras el envío sin montar
 * estado a mano, y `formAction` deja el formulario funcionando incluso antes
 * de que hidrate el JavaScript: el `<form>` hace POST y la Server Action
 * responde igual.
 *
 * Las acciones que terminan bien redirigen; solo las que se quedan en la
 * página —como pedir el enlace de recuperación— devuelven `ok: true`, y para
 * esas se pinta el aviso en lugar de volver a mostrar el formulario.
 */
export function AuthForm({
  action,
  submitLabel,
  pendingLabel,
  children,
  successTitle,
}: AuthFormProps) {
  const [state, formAction, isPending] = useActionState(
    async (_previous: AuthResult | null, formData: FormData) => action(formData),
    null,
  )

  if (state?.ok && (state.needsConfirmation || successTitle)) {
    return (
      <div className="border border-primary p-8">
        <h2 className="font-headline-md text-headline-md mb-4">
          {state.needsConfirmation ? 'Revisa tu correo' : (successTitle ?? 'Listo')}
        </h2>
        <p className="font-body-md text-body-md text-secondary">
          {state.message ??
            'Te enviamos un enlace para confirmar tu cuenta. Ábrelo desde este mismo dispositivo.'}
        </p>
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {children}

      {state?.message && !state.ok ? (
        <p role="alert" className="font-body-md text-[13px] text-accent-red">
          {state.message}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="solid"
        fullWidth
        disabled={isPending}
        className={cn('h-14', isPending && 'opacity-70')}
      >
        {isPending ? pendingLabel : submitLabel}
      </Button>
    </form>
  )
}
