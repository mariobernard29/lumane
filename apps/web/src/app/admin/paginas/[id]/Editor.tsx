'use client'

import { useActionState } from 'react'

import { guardarPagina } from '@/actions/admin/paginas'
import type { ResultadoAdmin } from '@/actions/admin/contenido'
import {
  FormRow,
  SaveBar,
  Select,
  StatusNote,
  TextArea,
  TextInput,
  Toggle,
} from '@/components/admin/primitivos'

/**
 * El editor de una página.
 *
 * El cuerpo es un `textarea` de Markdown y no un editor enriquecido. Un editor
 * WYSIWYG produce HTML que hay que sanear, y el saneador de este proyecto
 * tiene una lista blanca estricta: la mitad de lo que el editor generase
 * desaparecería al publicarse, sin avisar. Markdown se ve tal cual queda.
 */

export interface PaginaUI {
  id: string
  slug: string
  title: string
  excerpt: string | null
  body: string | null
  template: string
  seo_title: string | null
  seo_description: string | null
  is_published: boolean
}

export function EditorPagina({ pagina }: { pagina: PaginaUI }) {
  const [estado, accion] = useActionState<ResultadoAdmin | null, FormData>(
    async (_previo, formData) => guardarPagina(formData),
    null,
  )

  const esFaq = pagina.template === 'faq'

  return (
    <form action={accion} className="grid gap-4">
      {estado ? <StatusNote>{estado.mensaje}</StatusNote> : null}
      <input type="hidden" name="id" value={pagina.id} />

      <FormRow label="Título" htmlFor="title">
        <TextInput id="title" name="title" defaultValue={pagina.title} required />
      </FormRow>

      <FormRow
        label="Dirección"
        htmlFor="slug"
        hint="Lo que va después de /p/. Cambiarla rompe los enlaces del pie y los que ya se hayan compartido."
      >
        <TextInput id="slug" name="slug" defaultValue={pagina.slug} required />
      </FormRow>

      <FormRow
        label="Entradilla"
        htmlFor="excerpt"
        hint="La línea que acompaña al título arriba de la página."
      >
        <TextArea id="excerpt" name="excerpt" defaultValue={pagina.excerpt ?? ''} />
      </FormRow>

      <FormRow
        label="Plantilla"
        htmlFor="template"
        hint="«Preguntas» ignora el texto de abajo y pinta la tabla de preguntas frecuentes. «Contacto» pone el texto a dos columnas con la ficha de la boutique al lado."
      >
        <Select id="template" name="template" defaultValue={pagina.template}>
          <option value="prose">Texto</option>
          <option value="contact">Contacto</option>
          <option value="faq">Preguntas frecuentes</option>
        </Select>
      </FormRow>

      <FormRow
        label="Texto"
        htmlFor="body"
        hint={
          esFaq
            ? 'Esta página usa la plantilla de preguntas, así que este texto no se pinta. Las preguntas se editan en su propia sección.'
            : 'Markdown: ## para un subtítulo, **negrita**, - para una lista, [texto](/enlace) y tablas con |. Las imágenes NO se admiten aquí; si una página necesita una, hay que montarla como bloque.'
        }
      >
        <TextArea id="body" name="body" defaultValue={pagina.body ?? ''} className="min-h-96 font-mono" />
      </FormRow>

      <Toggle
        name="isPublished"
        defaultChecked={pagina.is_published}
        label="Publicada"
        hint="Sin publicar, la dirección devuelve «no encontrada» a quien no sea personal."
      />

      <h2 className="mt-4 font-label-upper text-label-upper text-secondary">Buscadores</h2>
      <FormRow label="Título" htmlFor="seoTitle">
        <TextInput id="seoTitle" name="seoTitle" defaultValue={pagina.seo_title ?? ''} />
      </FormRow>
      <FormRow label="Descripción" htmlFor="seoDescription">
        <TextArea
          id="seoDescription"
          name="seoDescription"
          defaultValue={pagina.seo_description ?? ''}
        />
      </FormRow>

      <SaveBar mensaje={estado?.ok ? estado.mensaje : null} />
    </form>
  )
}
