'use client'

import { useState, useTransition } from 'react'
import { BUCKETS } from '@lumane/db'

import {
  guardarHero,
  guardarImagenHero,
  guardarSeccion,
  moverSeccion,
} from '@/actions/admin/portada'
import { ImagePicker } from '@/components/admin/ImagePicker'
import { FormRow, StatusNote, TextArea, TextInput, Toggle } from '@/components/admin/primitivos'

/**
 * El editor de la portada.
 *
 * Los bloques salen en el mismo orden en que se ven en la tienda, con su tipo
 * escrito en pequeño. El tipo no se edita: decide qué renderizador lo pinta, y
 * cambiarlo a mano dejaría la sección invisible sin ninguna pista, porque el
 * sitio descarta en silencio lo que no sabe dibujar.
 *
 * Cada bloque enseña solo los campos que su tipo usa. Un «límite» en el bloque
 * de «Nuestra casa» no significaría nada, y ofrecerlo invita a rellenarlo.
 */

export interface SeccionUI {
  id: string
  type: string
  eyebrow: string | null
  title: string | null
  subtitle: string | null
  config: Record<string, unknown>
  position: number
  is_active: boolean
}

export interface HeroUI {
  id: string
  image_path: string
  image_alt: string
  eyebrow: string | null
  title: string | null
  subtitle: string | null
  cta_label: string | null
  cta_href: string | null
  secondary_cta_label: string | null
  secondary_cta_href: string | null
  is_active: boolean
}

const NOMBRES: Record<string, string> = {
  category_grid: 'Categorías',
  product_grid_new: 'Novedades',
  product_grid_sale: 'Rebajas',
  collection_grid: 'Colecciones',
  about_split: 'Bloque de texto',
}

/** Qué campos tiene sentido enseñar en cada tipo. */
const USA_LIMITE = new Set(['category_grid', 'product_grid_new', 'product_grid_sale', 'collection_grid'])
const USA_PARRAFO = new Set(['about_split'])

export function EditorPortada({ hero, secciones }: { hero: HeroUI | null; secciones: SeccionUI[] }) {
  const [aviso, setAviso] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()

  function correr(fn: () => Promise<{ ok: boolean; mensaje: string }>) {
    empezar(async () => {
      const r = await fn()
      if (r.mensaje) setAviso(r.mensaje)
    })
  }

  return (
    <div className="grid gap-10">
      {aviso ? <StatusNote>{aviso}</StatusNote> : null}

      {hero ? (
        <form action={(fd) => correr(() => guardarHero(fd))} className="grid gap-2">
          <input type="hidden" name="id" value={hero.id} />
          <h2 className="font-headline-sm text-headline-sm text-primary">Portada a sangre</h2>
          <p className="font-body-md text-body-md text-text-muted">
            La imagen grande de arriba, lo primero que ve quien entra.
          </p>

          <ImagePicker
            valor={hero.image_path}
            bucket={BUCKETS.content}
            prefijo="home"
            etiqueta="Imagen"
            ayuda="Horizontal y sin texto dentro: el texto va encima y se adapta a cada pantalla."
            onSubida={(path) => correr(() => guardarImagenHero(hero.id, path))}
          />

          <FormRow
            label="Descripción de la imagen"
            htmlFor="imageAlt"
            hint="Lo que lee quien no puede ver la foto. También es lo que entiende un buscador."
          >
            <TextInput id="imageAlt" name="imageAlt" defaultValue={hero.image_alt} required />
          </FormRow>

          <FormRow label="Antetítulo" htmlFor="h-eyebrow">
            <TextInput id="h-eyebrow" name="eyebrow" defaultValue={hero.eyebrow ?? ''} />
          </FormRow>
          <FormRow label="Título" htmlFor="h-title">
            <TextInput id="h-title" name="title" defaultValue={hero.title ?? ''} />
          </FormRow>
          <FormRow label="Texto" htmlFor="h-subtitle">
            <TextArea id="h-subtitle" name="subtitle" defaultValue={hero.subtitle ?? ''} />
          </FormRow>

          <div className="grid gap-2 sm:grid-cols-2">
            <FormRow label="Botón · texto" htmlFor="h-cta">
              <TextInput id="h-cta" name="ctaLabel" defaultValue={hero.cta_label ?? ''} />
            </FormRow>
            <FormRow label="Botón · destino" htmlFor="h-ctaHref">
              <TextInput id="h-ctaHref" name="ctaHref" defaultValue={hero.cta_href ?? ''} />
            </FormRow>
            <FormRow label="Segundo botón · texto" htmlFor="h-cta2">
              <TextInput
                id="h-cta2"
                name="secondaryCtaLabel"
                defaultValue={hero.secondary_cta_label ?? ''}
              />
            </FormRow>
            <FormRow label="Segundo botón · destino" htmlFor="h-cta2Href">
              <TextInput
                id="h-cta2Href"
                name="secondaryCtaHref"
                defaultValue={hero.secondary_cta_href ?? ''}
              />
            </FormRow>
          </div>

          <Toggle name="isActive" defaultChecked={hero.is_active} label="Se muestra" />

          <button
            type="submit"
            disabled={pendiente}
            className="justify-self-start border border-primary bg-primary px-6 py-2.5 font-label-upper text-label-upper text-on-primary disabled:opacity-40"
          >
            Guardar portada
          </button>
        </form>
      ) : (
        <p className="font-body-md text-body-md text-text-muted">
          Todavía no hay una portada a sangre configurada.
        </p>
      )}

      <section className="grid gap-3">
        <div className="grid gap-1">
          <h2 className="font-headline-sm text-headline-sm text-primary">Bloques</h2>
          <p className="font-body-md text-body-md text-text-muted">
            En el mismo orden en que se ven. Un bloque sin nada que mostrar no se pinta, en lugar
            de dejar un hueco.
          </p>
        </div>

        {secciones.map((s, i) => {
          const config = s.config ?? {}
          const etiquetaEnlace =
            (config.link_label as string) ?? (config.cta_label as string) ?? ''
          const destinoEnlace = (config.link_href as string) ?? (config.cta_href as string) ?? ''

          return (
            <form
              key={s.id}
              action={(fd) => correr(() => guardarSeccion(fd))}
              className="grid gap-2 border border-outline-variant bg-paper-bright p-4"
            >
              <input type="hidden" name="id" value={s.id} />

              <div className="flex items-center justify-between gap-3">
                <span className="font-label-upper text-label-upper text-secondary">
                  {NOMBRES[s.type] ?? s.type}
                </span>
                <div className="flex gap-1">
                  <Flecha
                    etiqueta="Subir bloque"
                    signo="↑"
                    inerte={i === 0 || pendiente}
                    onPress={() => correr(() => moverSeccion(s.id, 'arriba'))}
                  />
                  <Flecha
                    etiqueta="Bajar bloque"
                    signo="↓"
                    inerte={i === secciones.length - 1 || pendiente}
                    onPress={() => correr(() => moverSeccion(s.id, 'abajo'))}
                  />
                </div>
              </div>

              <FormRow label="Antetítulo" hint="El «01 / Comprar» que va sobre la regla.">
                <TextInput name="eyebrow" defaultValue={s.eyebrow ?? ''} />
              </FormRow>
              <FormRow label="Título">
                <TextInput name="title" defaultValue={s.title ?? ''} />
              </FormRow>

              {USA_PARRAFO.has(s.type) ? (
                <FormRow label="Párrafo">
                  <TextArea name="subtitle" defaultValue={s.subtitle ?? ''} />
                </FormRow>
              ) : (
                <input type="hidden" name="subtitle" value={s.subtitle ?? ''} />
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <FormRow label="Enlace · texto">
                  <TextInput name="linkLabel" defaultValue={etiquetaEnlace} />
                </FormRow>
                <FormRow label="Enlace · destino">
                  <TextInput name="linkHref" defaultValue={destinoEnlace} />
                </FormRow>
              </div>

              {USA_LIMITE.has(s.type) ? (
                <FormRow
                  label="Cuántas se muestran"
                  hint="Entre 1 y 24. Vacío usa el valor por omisión del bloque."
                >
                  <TextInput
                    name="limite"
                    inputMode="numeric"
                    defaultValue={config.limit == null ? '' : String(config.limit)}
                  />
                </FormRow>
              ) : (
                <input type="hidden" name="limite" value="" />
              )}

              <Toggle
                name="isActive"
                defaultChecked={s.is_active}
                label="Se muestra"
                hint="Desmárcalo para esconder el bloque sin perder sus textos."
              />

              <button
                type="submit"
                disabled={pendiente}
                className="justify-self-start border border-primary bg-primary px-6 py-2.5 font-label-upper text-label-upper text-on-primary disabled:opacity-40"
              >
                Guardar bloque
              </button>
            </form>
          )
        })}
      </section>
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
