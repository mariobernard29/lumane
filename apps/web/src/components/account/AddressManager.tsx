'use client'

import { useState, useTransition } from 'react'
import { Badge, Button, Icon, cn } from '@lumane/ui-web'

import { deleteAddress, saveAddress, setDefaultAddress } from '@/actions/account'
import { SelectField, TextField } from '@/components/checkout/Field'
import type { AccountAddress } from '@/lib/queries/account'

const ESTADOS = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas',
  'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México',
  'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit',
  'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí',
  'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
]

/**
 * Direcciones guardadas.
 *
 * Eliminar pide confirmación en la propia tarjeta, no con un `confirm()` del
 * navegador: los diálogos nativos bloquean la página entera y en el móvil
 * aparecen desligados de lo que se está borrando.
 */
export function AddressManager({ addresses }: { addresses: AccountAddress[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    startTransition(async () => {
      const result = await action()
      setNotice(result.message ?? null)
      if (result.ok) {
        setEditing(null)
        setIsCreating(false)
        setConfirmingDelete(null)
      }
    })
  }

  return (
    <div>
      {notice ? (
        <p role="status" className="font-body-md text-[13px] text-secondary mb-6">
          {notice}
        </p>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-col-gap">
        {addresses.map((address) =>
          editing === address.id ? (
            <AddressForm
              key={address.id}
              address={address}
              isPending={isPending}
              onCancel={() => setEditing(null)}
              onSubmit={(formData) => run(() => saveAddress(formData))}
            />
          ) : (
            <div key={address.id} className="border border-primary p-6 bg-paper-bright">
              <div className="flex items-center justify-between gap-3 mb-4">
                <span className="font-label-upper text-label-upper uppercase">
                  {address.label ?? 'Dirección'}
                </span>
                {address.isDefault ? <Badge variant="outline">Predeterminada</Badge> : null}
              </div>

              <p className="font-body-md text-body-md text-secondary">
                {address.recipient}
                <br />
                {[address.street, address.extNo, address.intNo ? `int. ${address.intNo}` : null]
                  .filter(Boolean)
                  .join(' ')}
                <br />
                {[address.neighborhood, address.city, address.state].filter(Boolean).join(', ')}
                <br />
                C.P. {address.postalCode}
                {address.phone ? ` · Tel. ${address.phone}` : ''}
              </p>

              {confirmingDelete === address.id ? (
                <div className="border-t border-surface-variant mt-5 pt-4">
                  <p className="font-body-md text-[13px] text-accent-red mb-3">
                    ¿Eliminar esta dirección?
                  </p>
                  <div className="flex gap-4 font-label-upper text-label-upper uppercase">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run(() => deleteAddress(address.id))}
                      className="text-accent-red underline underline-offset-4"
                    >
                      Sí, eliminar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(null)}
                      className="text-secondary hover:text-primary transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-5 mt-5 font-label-upper text-label-upper uppercase">
                  <button
                    type="button"
                    onClick={() => setEditing(address.id)}
                    className="hover:text-accent-red transition-colors"
                  >
                    Editar
                  </button>
                  {!address.isDefault ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run(() => setDefaultAddress(address.id))}
                      className="text-secondary hover:text-primary transition-colors"
                    >
                      Hacer principal
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(address.id)}
                    className="text-secondary hover:text-accent-red transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              )}
            </div>
          ),
        )}

        {isCreating ? (
          <AddressForm
            isPending={isPending}
            onCancel={() => setIsCreating(false)}
            onSubmit={(formData) => run(() => saveAddress(formData))}
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className={cn(
              'border border-dashed border-outline-variant min-h-[160px]',
              'flex flex-col items-center justify-center gap-3',
              'font-label-upper text-label-upper uppercase text-secondary',
              'hover:border-primary hover:text-primary transition-colors',
            )}
          >
            <Icon name="add" size={22} />
            Añadir nueva dirección
          </button>
        )}
      </div>
    </div>
  )
}

function AddressForm({
  address,
  isPending,
  onCancel,
  onSubmit,
}: {
  address?: AccountAddress
  isPending: boolean
  onCancel: () => void
  onSubmit: (formData: FormData) => void
}) {
  return (
    <form
      className="border border-primary p-6 bg-paper-bright sm:col-span-2"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(new FormData(event.currentTarget))
      }}
    >
      <h3 className="font-label-upper text-label-upper uppercase mb-6">
        {address ? 'Editar dirección' : 'Nueva dirección'}
      </h3>

      {address ? <input type="hidden" name="id" value={address.id} /> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
        <TextField
          id={`label-${address?.id ?? 'nueva'}`}
          name="label"
          label="Etiqueta (opcional)"
          placeholder="Casa, Oficina…"
          defaultValue={address?.label ?? ''}
        />
        <TextField
          id={`recipient-${address?.id ?? 'nueva'}`}
          name="recipient"
          label="Quién recibe"
          required
          defaultValue={address?.recipient ?? ''}
        />
        <TextField
          id={`street-${address?.id ?? 'nueva'}`}
          name="street"
          label="Calle"
          required
          defaultValue={address?.street ?? ''}
          wrapperClassName="md:col-span-2"
        />
        <TextField
          id={`extNo-${address?.id ?? 'nueva'}`}
          name="extNo"
          label="Número exterior"
          defaultValue={address?.extNo ?? ''}
        />
        <TextField
          id={`intNo-${address?.id ?? 'nueva'}`}
          name="intNo"
          label="Interior (opcional)"
          defaultValue={address?.intNo ?? ''}
        />
        <TextField
          id={`neighborhood-${address?.id ?? 'nueva'}`}
          name="neighborhood"
          label="Colonia"
          defaultValue={address?.neighborhood ?? ''}
        />
        <TextField
          id={`postalCode-${address?.id ?? 'nueva'}`}
          name="postalCode"
          label="Código postal"
          required
          inputMode="numeric"
          maxLength={5}
          defaultValue={address?.postalCode ?? ''}
        />
        <TextField
          id={`city-${address?.id ?? 'nueva'}`}
          name="city"
          label="Ciudad"
          required
          defaultValue={address?.city ?? ''}
        />
        <SelectField
          id={`state-${address?.id ?? 'nueva'}`}
          name="state"
          label="Estado"
          required
          defaultValue={address?.state ?? 'Sinaloa'}
        >
          {ESTADOS.map((estado) => (
            <option key={estado} value={estado}>
              {estado}
            </option>
          ))}
        </SelectField>
        <TextField
          id={`phone-${address?.id ?? 'nueva'}`}
          name="phone"
          label="Teléfono"
          type="tel"
          defaultValue={address?.phone ?? ''}
        />
        <TextField
          id={`notes-${address?.id ?? 'nueva'}`}
          name="deliveryNotes"
          label="Referencias (opcional)"
          defaultValue={address?.deliveryNotes ?? ''}
          wrapperClassName="md:col-span-2"
        />
      </div>

      <label className="flex items-center gap-3 mt-6 cursor-pointer font-body-md text-body-md text-secondary">
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={address?.isDefault ?? false}
          className="w-4 h-4 border-outline text-primary focus:ring-0 focus:ring-offset-0"
        />
        Usar como dirección principal
      </label>

      <div className="flex flex-wrap gap-4 mt-8">
        <Button type="submit" variant="solid" size="md" disabled={isPending}>
          {isPending ? 'Guardando…' : 'Guardar dirección'}
        </Button>
        <Button type="button" variant="subtle" size="md" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
