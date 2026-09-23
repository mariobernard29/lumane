'use client'

import { useState, useTransition } from 'react'

import { borrarEnlace, guardarEnlace, moverEnlace, renombrarMenu } from '@/actions/admin/menus'
import { StatusNote, TextInput, Toggle } from '@/components/admin/primitivos'

/**
 * El editor de un menú.
 *
 * Una fila por enlace, con sus dos campos siempre visibles. No hay modal de
 * edición: un menú tiene cuatro o cinco entradas y abrir una ventana para
 * cambiar una palabra cuesta más que el cambio.
 *
 * El orden se mueve con flechas, no arrastrando. En una tablet, arrastrar
 * dentro de una página que también se desplaza al tocar es una pelea que se
 * pierde la mitad de las veces.
 */

export interface EnlaceUI {
  id: string
  label: string
  href: string
  position: number
  is_visible: boolean
  is_emphasized: boolean
}

export interface MenuUI {
  id: string
  key: string
  name: string
  items: EnlaceUI[]
}

export function EditorMenus({ menus }: { menus: MenuUI[] }) {
  const [aviso, setAviso] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()

  function correr(fn: () => Promise<{ ok: boolean; mensaje: string }>) {
    empezar(async () => {
      const r = await fn()
      // Los movimientos de orden devuelven mensaje vacío: no hay nada que
      // anunciar cuando el resultado ya se ve en la lista.
      if (r.mensaje) setAviso(r.mensaje)
    })
  }

  return (
    <div className="grid gap-8">
      {aviso ? <StatusNote>{aviso}</StatusNote> : null}

      {menus.map((menu) => (
        <section key={menu.id} className="grid gap-3">
          <header className="grid gap-1">
            {menu.key === 'header' ? (
              <h2 className="font-headline-sm text-headline-sm text-primary">Navegación principal</h2>
            ) : (
              <>
                <label
                  htmlFor={`titulo-${menu.id}`}
                  className="font-label-upper text-label-upper text-secondary"
                >
                  Título de la columna
                </label>
                <TextInput
                  id={`titulo-${menu.id}`}
                  defaultValue={menu.name}
                  disabled={pendiente}
                  onBlur={(e) => {
                    if (e.target.value.trim() !== menu.name) {
                      correr(() => renombrarMenu(menu.id, e.target.value))
                    }
                  }}
                />
              </>
            )}
            <p className="font-body-md text-body-md text-text-muted">
              {menu.key === 'header'
                ? 'La fila de categorías de arriba. Lo destacado se pinta distinto.'
                : menu.key === 'footer_legal'
                  ? 'Los enlaces pequeños de la última línea del pie.'
                  : 'Una columna del pie de página.'}
            </p>
          </header>

          <ul className="grid gap-2">
            {menu.items.map((item, i) => (
              <li
                key={item.id}
                className="grid gap-2 border border-outline-variant bg-paper-bright p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
              >
                <form
                  action={(fd) => correr(() => guardarEnlace(fd))}
                  className="contents"
                  id={`f-${item.id}`}
                >
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="menuId" value={menu.id} />
                  <input type="hidden" name="position" value={item.position} />

                  <div className="grid gap-1">
                    <span className="font-label-upper text-label-upper text-secondary">Texto</span>
                    <TextInput name="label" defaultValue={item.label} required />
                  </div>

                  <div className="grid gap-1">
                    <span className="font-label-upper text-label-upper text-secondary">Destino</span>
                    <TextInput name="href" defaultValue={item.href} required />
                  </div>

                  <div className="grid gap-1 sm:pt-6">
                    <div className="flex gap-1">
                      <Flecha
                        etiqueta={`Subir ${item.label}`}
                        signo="↑"
                        inerte={i === 0 || pendiente}
                        onPress={() => correr(() => moverEnlace(item.id, 'arriba'))}
                      />
                      <Flecha
                        etiqueta={`Bajar ${item.label}`}
                        signo="↓"
                        inerte={i === menu.items.length - 1 || pendiente}
                        onPress={() => correr(() => moverEnlace(item.id, 'abajo'))}
                      />
                      <button
                        type="submit"
                        disabled={pendiente}
                        className="border border-primary bg-primary px-4 py-2 font-label-upper text-label-upper text-on-primary disabled:opacity-40"
                      >
                        Guardar
                      </button>
                    </div>
                  </div>

                  <div className="sm:col-span-3">
                    <div className="flex flex-wrap items-center gap-x-6">
                      <Toggle
                        name="isVisible"
                        defaultChecked={item.is_visible}
                        label="Visible"
                        hint="Desmárcalo para esconderlo sin borrarlo."
                      />
                      {menu.key === 'header' ? (
                        <Toggle
                          name="isEmphasized"
                          defaultChecked={item.is_emphasized}
                          label="Destacado"
                        />
                      ) : (
                        <input type="hidden" name="isEmphasized" value="" />
                      )}
                    </div>
                  </div>
                </form>

                <div className="sm:col-span-3">
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() => {
                      // Sin confirmación: borrar un enlace es reversible en
                      // veinte segundos escribiéndolo otra vez, y un diálogo
                      // más por cada acción entrena a pulsar «sí» sin leer.
                      correr(() => borrarEnlace(item.id))
                    }}
                    className="font-label-upper text-label-upper text-text-muted underline disabled:opacity-40"
                  >
                    Borrar
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <form
            action={(fd) => correr(() => guardarEnlace(fd))}
            className="grid gap-2 border border-dashed border-outline-variant p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          >
            <input type="hidden" name="menuId" value={menu.id} />
            <input
              type="hidden"
              name="position"
              value={(menu.items.at(-1)?.position ?? 0) + 1}
            />
            <input type="hidden" name="isVisible" value="on" />
            <input type="hidden" name="isEmphasized" value="" />

            <div className="grid gap-1">
              <span className="font-label-upper text-label-upper text-secondary">Texto</span>
              <TextInput name="label" placeholder="Vestidos" required />
            </div>
            <div className="grid gap-1">
              <span className="font-label-upper text-label-upper text-secondary">Destino</span>
              <TextInput name="href" placeholder="/catalogo/vestidos" required />
            </div>
            <button
              type="submit"
              disabled={pendiente}
              className="border border-primary px-4 py-2 font-label-upper text-label-upper text-primary disabled:opacity-40"
            >
              Añadir
            </button>
          </form>
        </section>
      ))}
    </div>
  )
}

function Flecha({
  etiqueta,
  signo,
  inerte,
  onPress,
}: {
  etiqueta: string
  signo: string
  inerte: boolean
  onPress: () => void
}) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      disabled={inerte}
      onClick={onPress}
      className="size-11 border border-outline-variant font-body-md text-body-md text-primary disabled:opacity-30"
    >
      {signo}
    </button>
  )
}
