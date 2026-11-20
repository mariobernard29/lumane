'use client'

import { useActionState, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'

import type { ResultadoAdmin } from '@/actions/admin/contenido'
import { cambiarAcceso, darDeAlta, guardarPersona, nuevaContrasena } from '@/actions/admin/personal'
import { FormRow, Select, StatusNote, TextInput } from '@/components/admin/primitivos'

export interface Persona {
  id: string
  nombre: string
  correo: string | null
  rol: 'owner' | 'manager' | 'cashier'
  activa: boolean
  superusuaria: boolean
  ultimoAcceso: string | null
  esYo: boolean
}

const ROLES: { key: Persona['rol']; nombre: string; detalle: string }[] = [
  { key: 'cashier', nombre: 'Cajera', detalle: 'Vende y maneja la caja de su turno. No ve reportes.' },
  { key: 'manager', nombre: 'Encargada', detalle: 'Ventas, caja, inventario, pedidos en línea, contenido y reportes.' },
  { key: 'owner', nombre: 'Propietaria', detalle: 'Todo, menos administrar al personal.' },
]

function nombreRol(key: Persona['rol']) {
  return ROLES.find((r) => r.key === key)?.nombre ?? key
}

/** El formulario lleva su propio botón: varios por pantalla, no una barra. */
function Boton({ children, variante = 'solido' }: { children: React.ReactNode; variante?: 'solido' | 'linea' }) {
  const { pending } = useFormStatus()
  const estilo =
    variante === 'solido'
      ? 'border-primary bg-primary text-on-primary'
      : 'border-primary bg-paper-bright text-primary'
  return (
    <button
      type="submit"
      disabled={pending}
      className={`border px-5 py-2.5 font-label-upper text-label-upper disabled:opacity-40 ${estilo}`}
    >
      {pending ? 'Un momento…' : children}
    </button>
  )
}

function useAccion(accion: (f: FormData) => Promise<ResultadoAdmin>) {
  return useActionState<ResultadoAdmin | null, FormData>(async (_p, f) => accion(f), null)
}

function fecha(iso: string | null) {
  if (!iso) return 'Nunca ha entrado'
  return `Último acceso: ${new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Mazatlan',
  }).format(new Date(iso))}`
}

export function NuevaPersona() {
  const [estado, accion] = useAccion(darDeAlta)
  // Un alta correcta vacía el formulario cambiando su `key`; una fallida deja
  // lo escrito para corregirlo.
  const [vuelta, setVuelta] = useState(0)
  useEffect(() => {
    if (estado?.ok) setVuelta((v) => v + 1)
  }, [estado])

  return (
    <section className="grid gap-3 border border-primary bg-paper-bright p-5">
      <h2 className="font-label-upper text-label-upper text-primary">Dar de alta</h2>
      {estado ? <StatusNote>{estado.mensaje}</StatusNote> : null}
      <form key={vuelta} action={accion} className="grid">
        <FormRow label="Nombre completo" htmlFor="alta-nombre">
          <TextInput id="alta-nombre" name="nombre" required autoComplete="off" />
        </FormRow>
        <FormRow label="Correo" htmlFor="alta-correo" hint="Con este correo entrará al panel y a la tablet.">
          <TextInput id="alta-correo" name="correo" type="email" required autoComplete="off" />
        </FormRow>
        <FormRow label="Rol" htmlFor="alta-rol">
          <Select id="alta-rol" name="rol" defaultValue="cashier">
            {ROLES.map((r) => (
              <option key={r.key} value={r.key}>
                {`${r.nombre} — ${r.detalle}`}
              </option>
            ))}
          </Select>
        </FormRow>
        <FormRow
          label="Contraseña"
          htmlFor="alta-contrasena"
          hint="Mínimo 8 caracteres. Dísela en persona; puedes cambiarla después desde aquí."
        >
          <TextInput
            id="alta-contrasena"
            name="contrasena"
            type="text"
            minLength={8}
            required
            autoComplete="new-password"
            spellCheck={false}
          />
        </FormRow>
        <div className="pt-4">
          <Boton>Dar de alta</Boton>
        </div>
      </form>
    </section>
  )
}

export function FichaPersona({ persona: p }: { persona: Persona }) {
  const [estadoDatos, accionDatos] = useAccion(guardarPersona)
  const [estadoAcceso, accionAcceso] = useAccion(cambiarAcceso)
  const [estadoClave, accionClave] = useAccion(nuevaContrasena)
  const [abierta, setAbierta] = useState(false)

  return (
    <article className={`grid gap-3 border border-outline-variant bg-paper-bright p-4 ${p.activa ? '' : 'opacity-70'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <p className="font-body-md text-body-lg text-primary">
            {p.nombre}
            {p.esYo ? <span className="text-text-muted"> (tú)</span> : null}
          </p>
          <p className="font-body-md text-body-md text-secondary">{p.correo}</p>
          <p className="font-body-md text-body-md text-text-muted">{fecha(p.ultimoAcceso)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.superusuaria ? (
            <span className="border border-primary bg-primary px-2 py-1 font-label-upper text-label-upper text-on-primary">
              Superusuaria
            </span>
          ) : null}
          <span className="border border-primary px-2 py-1 font-label-upper text-label-upper text-primary">
            {nombreRol(p.rol)}
          </span>
          {!p.activa ? (
            <span className="border border-outline px-2 py-1 font-label-upper text-label-upper text-secondary">
              Sin acceso
            </span>
          ) : null}
        </div>
      </div>

      {/* El de acceso va arriba: es el que cambia el estado de la ficha. */}
      {estadoAcceso ? <StatusNote>{estadoAcceso.mensaje}</StatusNote> : null}

      <button
        type="button"
        onClick={() => setAbierta((a) => !a)}
        aria-expanded={abierta}
        className="justify-self-start font-label-upper text-label-upper text-primary underline underline-offset-4"
      >
        {abierta ? 'Cerrar' : 'Editar'}
      </button>

      {abierta ? (
        <div className="grid gap-6 border-t border-surface-variant pt-3">
          {p.superusuaria ? (
            <p className="font-body-md text-body-md text-text-muted">
              Es la cuenta principal: su rol y su acceso no se cambian desde aquí, para que la
              tienda nunca se quede sin quien administre al personal.
            </p>
          ) : (
            <form action={accionDatos} className="grid">
              {estadoDatos ? <StatusNote>{estadoDatos.mensaje}</StatusNote> : null}
              <input type="hidden" name="id" value={p.id} />
              <FormRow label="Nombre" htmlFor={`nombre-${p.id}`}>
                <TextInput id={`nombre-${p.id}`} name="nombre" defaultValue={p.nombre} required />
              </FormRow>
              <FormRow label="Rol" htmlFor={`rol-${p.id}`}>
                <Select id={`rol-${p.id}`} name="rol" defaultValue={p.rol}>
                  {ROLES.map((r) => (
                    <option key={r.key} value={r.key}>
                      {`${r.nombre} — ${r.detalle}`}
                    </option>
                  ))}
                </Select>
              </FormRow>
              <div className="pt-3">
                <Boton>Guardar cambios</Boton>
              </div>
            </form>
          )}

          <form action={accionClave} className="grid">
            {estadoClave ? <StatusNote>{estadoClave.mensaje}</StatusNote> : null}
            <input type="hidden" name="id" value={p.id} />
            <FormRow label="Nueva contraseña" htmlFor={`clave-${p.id}`} hint="Mínimo 8 caracteres.">
              <TextInput
                id={`clave-${p.id}`}
                name="contrasena"
                type="text"
                minLength={8}
                required
                autoComplete="new-password"
                spellCheck={false}
              />
            </FormRow>
            <div className="pt-3">
              <Boton variante="linea">Cambiar contraseña</Boton>
            </div>
          </form>

          {!p.superusuaria ? (
            <form action={accionAcceso} className="grid gap-2 border-t border-surface-variant pt-4">
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="activa" value={p.activa ? 'false' : 'true'} />
              <p className="font-body-md text-body-md text-text-muted">
                {p.activa
                  ? 'Deja de poder entrar al panel y a la tablet en ese momento. Su historial se queda.'
                  : 'Vuelve a entrar con su mismo correo y la contraseña que tenía.'}
              </p>
              <div>
                <Boton variante={p.activa ? 'linea' : 'solido'}>
                  {p.activa ? 'Quitar acceso' : 'Devolver acceso'}
                </Boton>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
