'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Button } from '@lumane/ui-web'

import { updateProfile, type ActionResult } from '@/actions/account'
import { TextField } from '@/components/checkout/Field'
import type { AccountProfile } from '@/lib/queries/account'

/**
 * Datos personales.
 *
 * El correo se muestra pero NO se edita aquí: cambiarlo es cambiar la
 * credencial de acceso y Supabase exige confirmar el nuevo por correo antes de
 * aplicarlo. Ofrecerlo como un campo más del formulario daría a entender que se
 * guarda al instante, y no es así.
 */
export function ProfileForm({ profile }: { profile: AccountProfile }) {
  const [state, formAction, isPending] = useActionState(
    async (_previous: ActionResult | null, formData: FormData) => updateProfile(formData),
    null,
  )

  return (
    <form action={formAction} className="max-w-2xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6">
        <TextField
          id="firstName"
          name="firstName"
          label="Nombre"
          required
          autoComplete="given-name"
          defaultValue={profile.firstName}
        />
        <TextField
          id="lastName"
          name="lastName"
          label="Apellidos"
          autoComplete="family-name"
          defaultValue={profile.lastName ?? ''}
        />

        <div className="md:col-span-2">
          <p className="font-label-upper text-label-upper uppercase text-secondary mb-1">
            Correo electrónico
          </p>
          <p className="font-body-md text-body-md py-2.5 border-b border-surface-variant">
            {profile.email}
          </p>
          <p className="font-body-md text-[13px] text-text-muted mt-1.5">
            Es tu acceso a la cuenta. Para cambiarlo, escríbenos y lo hacemos contigo.
          </p>
        </div>

        <TextField
          id="phone"
          name="phone"
          label="Teléfono"
          type="tel"
          autoComplete="tel"
          defaultValue={profile.phone ?? ''}
        />
        <TextField
          id="birthday"
          name="birthday"
          label="Fecha de nacimiento"
          // `type="date"` en lugar del texto libre del prototipo: evita las
          // ambigüedades de 03/14 contra 14/03 y da el selector nativo.
          type="date"
          defaultValue={profile.birthday ?? ''}
          hint="Para felicitarte con algo."
        />

        <label className="md:col-span-2 flex items-start gap-3 cursor-pointer font-body-md text-body-md text-secondary">
          <input
            type="checkbox"
            name="acceptsMarketing"
            defaultChecked={profile.acceptsMarketing}
            className="w-4 h-4 mt-1 border-outline text-primary focus:ring-0 focus:ring-offset-0"
          />
          Recibir novedades y acceso anticipado por correo.
        </label>

        <div className="md:col-span-2 flex items-center justify-between border-t border-surface-variant pt-6">
          <div>
            <p className="font-body-md text-body-md">Contraseña</p>
            <p className="font-label-upper text-[10px] uppercase tracking-[0.16em] text-secondary mt-1">
              Se cambia con un enlace que te enviamos
            </p>
          </div>
          <Link
            href="/recuperar"
            className="font-label-upper text-label-upper uppercase underline underline-offset-4 hover:text-accent-red transition-colors"
          >
            Cambiar
          </Link>
        </div>
      </div>

      {state?.message ? (
        <p
          role="status"
          className={`font-body-md text-[13px] mt-6 ${state.ok ? 'text-secondary' : 'text-accent-red'}`}
        >
          {state.message}
        </p>
      ) : null}

      <Button type="submit" variant="solid" size="md" disabled={isPending} className="mt-8">
        {isPending ? 'Guardando…' : 'Guardar cambios'}
      </Button>
    </form>
  )
}
