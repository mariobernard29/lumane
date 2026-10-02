'use client'

import { useActionState } from 'react'

import { guardarTarifasLocales } from '@/actions/admin/envios'
import type { ResultadoAdmin } from '@/actions/admin/contenido'
import { FormRow, SaveBar, StatusNote, TextInput } from '@/components/admin/primitivos'

export interface Tramo {
  id: string
  minKm: number
  maxKm: number
  pesos: number
}

/** Un campo de precio por tramo; los kilómetros son la etiqueta, no se editan. */
export function FormularioTarifas({ tramos }: { tramos: Tramo[] }) {
  const [estado, accion] = useActionState<ResultadoAdmin | null, FormData>(
    async (_previo, formData) => guardarTarifasLocales(formData),
    null,
  )

  return (
    <form action={accion} className="grid gap-6">
      {estado ? <StatusNote>{estado.mensaje}</StatusNote> : null}

      <section>
        <h2 className="font-label-upper text-label-upper text-secondary">
          Entrega local · precio por distancia
        </h2>
        {tramos.map((t) => (
          <FormRow
            key={t.id}
            label={`De ${t.minKm} a ${t.maxKm} km`}
            htmlFor={`precio-${t.id}`}
          >
            <div className="flex items-center gap-2 max-w-48">
              <span className="font-body-md text-body-md text-secondary">$</span>
              <TextInput
                id={`precio-${t.id}`}
                name={`precio:${t.id}`}
                inputMode="decimal"
                required
                defaultValue={String(t.pesos)}
              />
              <span className="font-body-md text-body-md text-secondary">MXN</span>
            </div>
          </FormRow>
        ))}
      </section>

      <SaveBar mensaje={estado?.ok ? estado.mensaje : null} />
    </form>
  )
}
