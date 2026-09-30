'use client'

import { useState, useTransition } from 'react'
import { BUCKETS } from '@lumane/db'

import {
  agregarFoto,
  guardarFoto,
  guardarImagenFoto,
  moverFoto,
  quitarFoto,
} from '@/actions/admin/boutique'
import { ImagePicker } from '@/components/admin/ImagePicker'
import { FormRow, StatusNote, TextInput } from '@/components/admin/primitivos'

/**
 * La galería de la boutique.
 *
 * Cada foto es una tarjeta con su imagen y su descripción.
 * El orden se cambia con botones de subir y bajar, no arrastrando: esto se
 * administra desde la tablet, y arrastrar con el dedo en una lista que además
 * hace scroll es una pelea perdida.
 *
 * Una foto vive en dos pasos —primero el hueco, luego la imagen— porque el
 * `ImagePicker` sube el archivo contra una fila que ya tiene que existir. Por
 * eso «Añadir foto» crea la tarjeta vacía y la subida viene después.
 */

export interface FotoUI {
  id: string
  image_path: string
  image_alt: string | null
}

export function Galeria({ fotos }: { fotos: FotoUI[] }) {
  const [aviso, setAviso] = useState<string | null>(null)
  const [, empezar] = useTransition()

  function correr(accion: () => Promise<{ ok: boolean; mensaje: string }>) {
    empezar(async () => {
      const r = await accion()
      setAviso(r.mensaje)
    })
  }

  return (
    <div className="grid gap-6">
      {aviso ? <StatusNote>{aviso}</StatusNote> : null}

      {fotos.length === 0 ? (
        <p className="font-body-md text-body-md text-text-muted">
          Todavía no hay fotos. Mientras no subas ninguna, la página de la boutique enseña la
          dirección y el mapa, sin galería.
        </p>
      ) : null}

      {fotos.map((foto, i) => (
        <section key={foto.id} className="border border-outline-variant bg-paper-bright p-4 grid gap-2">
          <header className="flex items-center justify-between gap-4">
            <span className="font-label-upper text-label-upper text-secondary">
              {`Foto ${i + 1}`}
            </span>
            <div className="flex items-center gap-2">
              <form action={(fd) => correr(() => moverFoto(fd))}>
                <input type="hidden" name="id" value={foto.id} />
                <input type="hidden" name="direccion" value="arriba" />
                <button
                  type="submit"
                  disabled={i === 0}
                  className="border border-outline-variant px-3 py-1.5 font-label-upper text-label-upper text-primary disabled:opacity-40"
                >
                  Subir
                </button>
              </form>
              <form action={(fd) => correr(() => moverFoto(fd))}>
                <input type="hidden" name="id" value={foto.id} />
                <input type="hidden" name="direccion" value="abajo" />
                <button
                  type="submit"
                  disabled={i === fotos.length - 1}
                  className="border border-outline-variant px-3 py-1.5 font-label-upper text-label-upper text-primary disabled:opacity-40"
                >
                  Bajar
                </button>
              </form>
              <form action={(fd) => correr(() => quitarFoto(fd))}>
                <input type="hidden" name="id" value={foto.id} />
                <button
                  type="submit"
                  className="border border-primary px-3 py-1.5 font-label-upper text-label-upper text-primary"
                >
                  Quitar
                </button>
              </form>
            </div>
          </header>

          <ImagePicker
            // La cadena vacía es el hueco recién creado. `ImagePicker` espera
            // `null` para «todavía no hay imagen».
            valor={foto.image_path || null}
            bucket={BUCKETS.content}
            prefijo="boutique"
            etiqueta="Foto"
            ayuda="Verticales se ven mejor: la galería recorta a 3:4, como salen del teléfono."
            onSubida={(path) => correr(() => guardarImagenFoto(foto.id, path))}
          />

          <form action={(fd) => correr(() => guardarFoto(fd))} className="grid gap-2">
            <input type="hidden" name="id" value={foto.id} />

            <FormRow
              label="Descripción de la foto"
              htmlFor={`alt-${foto.id}`}
              hint="Lo que lee quien no puede verla. Por ejemplo: «Vista del mostrador con los vestidos de temporada»."
            >
              <TextInput
                id={`alt-${foto.id}`}
                name="imageAlt"
                defaultValue={foto.image_alt ?? ''}
                required
              />
            </FormRow>

            <div>
              <button
                type="submit"
                className="border border-primary bg-primary px-4 py-2.5 font-label-upper text-label-upper text-on-primary"
              >
                Guardar
              </button>
            </div>
          </form>
        </section>
      ))}

      <form action={() => correr(() => agregarFoto())}>
        <button
          type="submit"
          className="border border-primary px-4 py-2.5 font-label-upper text-label-upper text-primary"
        >
          Añadir foto
        </button>
      </form>
    </div>
  )
}
