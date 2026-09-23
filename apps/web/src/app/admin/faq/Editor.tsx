'use client'

import { useState, useTransition } from 'react'

import { borrarPregunta, guardarPregunta, moverPregunta } from '@/actions/admin/paginas'
import { StatusNote, TextArea, TextInput, Toggle } from '@/components/admin/primitivos'

/**
 * Las preguntas frecuentes.
 *
 * Agrupadas por categoría, que es como se ven en la tienda. La categoría es
 * un campo de texto libre y no una lista cerrada: escribir una nueva crea el
 * grupo, y vaciar el último de un grupo lo hace desaparecer. Una tabla de
 * categorías para cinco valores que cambian una vez al año sería una pantalla
 * más que mantener.
 *
 * **El orden de los GRUPOS lo marca la primera pregunta de cada uno**, así que
 * las flechas solo mueven dentro de la categoría. Mover una pregunta entre
 * grupos reordenaría los grupos sin que nadie lo pidiera.
 */

export interface PreguntaUI {
  id: string
  question: string
  answer: string
  category: string
  position: number
  is_visible: boolean
}

export function EditorFaq({ preguntas }: { preguntas: PreguntaUI[] }) {
  const [aviso, setAviso] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()

  function correr(fn: () => Promise<{ ok: boolean; mensaje: string }>) {
    empezar(async () => {
      const r = await fn()
      if (r.mensaje) setAviso(r.mensaje)
    })
  }

  // Agrupadas conservando el orden de aparición, que es el del sitio.
  const grupos: { categoria: string; items: PreguntaUI[] }[] = []
  for (const p of preguntas) {
    const grupo = grupos.find((g) => g.categoria === p.category)
    if (grupo) grupo.items.push(p)
    else grupos.push({ categoria: p.category, items: [p] })
  }

  const siguientePosicion = (preguntas.at(-1)?.position ?? 0) + 1

  return (
    <div className="grid gap-8">
      {aviso ? <StatusNote>{aviso}</StatusNote> : null}

      {grupos.map((g) => (
        <section key={g.categoria} className="grid gap-3">
          <h2 className="font-headline-sm text-headline-sm text-primary">{g.categoria}</h2>

          {g.items.map((p, i) => (
            <form
              key={p.id}
              action={(fd) => correr(() => guardarPregunta(fd))}
              className="grid gap-2 border border-outline-variant bg-paper-bright p-4"
            >
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="position" value={p.position} />

              <div className="flex items-start justify-between gap-3">
                <div className="grid flex-1 gap-1">
                  <span className="font-label-upper text-label-upper text-secondary">Pregunta</span>
                  <TextInput name="question" defaultValue={p.question} required />
                </div>
                <div className="flex gap-1 pt-6">
                  <Flecha
                    etiqueta="Subir la pregunta"
                    signo="↑"
                    inerte={i === 0 || pendiente}
                    onPress={() => correr(() => moverPregunta(p.id, 'arriba'))}
                  />
                  <Flecha
                    etiqueta="Bajar la pregunta"
                    signo="↓"
                    inerte={i === g.items.length - 1 || pendiente}
                    onPress={() => correr(() => moverPregunta(p.id, 'abajo'))}
                  />
                </div>
              </div>

              <div className="grid gap-1">
                <span className="font-label-upper text-label-upper text-secondary">Respuesta</span>
                <TextArea name="answer" defaultValue={p.answer} required />
              </div>

              <div className="grid gap-1">
                <span className="font-label-upper text-label-upper text-secondary">Categoría</span>
                <TextInput name="category" defaultValue={p.category} required list="categorias-faq" />
              </div>

              <Toggle name="isVisible" defaultChecked={p.is_visible} label="Se muestra" />

              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="submit"
                  disabled={pendiente}
                  className="border border-primary bg-primary px-6 py-2.5 font-label-upper text-label-upper text-on-primary disabled:opacity-40"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() => correr(() => borrarPregunta(p.id))}
                  className="font-label-upper text-label-upper text-text-muted underline disabled:opacity-40"
                >
                  Borrar
                </button>
              </div>
            </form>
          ))}
        </section>
      ))}

      {/* Las categorías existentes se ofrecen como sugerencia, pero el campo
          sigue siendo libre: escribir una nueva crea el grupo. */}
      <datalist id="categorias-faq">
        {grupos.map((g) => (
          <option key={g.categoria} value={g.categoria} />
        ))}
      </datalist>

      <form
        action={(fd) => correr(() => guardarPregunta(fd))}
        className="grid gap-2 border border-dashed border-outline-variant p-4"
      >
        <h2 className="font-headline-sm text-headline-sm text-primary">Añadir una pregunta</h2>
        <input type="hidden" name="position" value={siguientePosicion} />
        <input type="hidden" name="isVisible" value="on" />

        <div className="grid gap-1">
          <span className="font-label-upper text-label-upper text-secondary">Pregunta</span>
          <TextInput name="question" placeholder="¿Hacen envíos a toda la República?" required />
        </div>
        <div className="grid gap-1">
          <span className="font-label-upper text-label-upper text-secondary">Respuesta</span>
          <TextArea name="answer" required />
        </div>
        <div className="grid gap-1">
          <span className="font-label-upper text-label-upper text-secondary">Categoría</span>
          <TextInput
            name="category"
            list="categorias-faq"
            placeholder="Envíos"
            defaultValue={grupos.at(-1)?.categoria ?? ''}
            required
          />
        </div>

        <button
          type="submit"
          disabled={pendiente}
          className="justify-self-start border border-primary px-6 py-2.5 font-label-upper text-label-upper text-primary disabled:opacity-40"
        >
          Añadir
        </button>
      </form>
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
