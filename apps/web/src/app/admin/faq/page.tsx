import Link from 'next/link'

import { createServerSupabase } from '@/lib/supabase/server'
import { EditorFaq, type PreguntaUI } from './Editor.tsx'

/**
 * Preguntas frecuentes.
 *
 * Viven en su propia tabla y no en el cuerpo de la página: así el sitio las
 * pinta como un acordeón agrupado por categoría, y no como una lista larga de
 * texto que hay que leer entera para encontrar una respuesta.
 *
 * Se leen todas, también las ocultas: es aquí donde se vuelven a mostrar.
 */
export default async function FaqPage() {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('faqs')
    .select('id, question, answer, category, position, is_visible')
    .order('position')

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <Link href="/admin/paginas" className="font-label-upper text-label-upper text-secondary">
          ← Páginas
        </Link>
        <h1 className="font-headline-md text-headline-md text-primary">Preguntas frecuentes</h1>
        <p className="font-body-md text-body-md text-text-muted">
          Se ven agrupadas por categoría en la página de preguntas. El orden de los grupos lo marca
          la primera pregunta de cada uno.
        </p>
      </header>

      {error ? (
        <p className="border border-primary px-3 py-2 font-body-md text-body-md text-primary">
          {error.message}
        </p>
      ) : (
        // `category` admite nulos en el esquema aunque hoy ninguna fila lo
        // tenga. Se mapea con un grupo de descarte en vez de forzar el tipo con
        // un `as`: una pregunta sin categoría tiene que poder verse y
        // arreglarse, no desaparecer detrás de una mentira del tipado.
        <EditorFaq
          preguntas={(data ?? []).map<PreguntaUI>((p) => ({
            ...p,
            category: p.category ?? 'Sin categoría',
          }))}
        />
      )}
    </div>
  )
}
