import Link from 'next/link'
import { notFound } from 'next/navigation'

import { createServerSupabase } from '@/lib/supabase/server'
import { EditorPagina, type PaginaUI } from './Editor.tsx'

export default async function PaginaEditar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('pages')
    .select('id, slug, title, excerpt, body, template, seo_title, seo_description, is_published')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return (
      <p className="border border-primary px-3 py-2 font-body-md text-body-md text-primary">
        {error.message}
      </p>
    )
  }
  if (!data) notFound()

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <Link href="/admin/paginas" className="font-label-upper text-label-upper text-secondary">
          ← Páginas
        </Link>
        <h1 className="font-headline-md text-headline-md text-primary">{data.title}</h1>
        {data.is_published ? (
          <Link
            href={`/p/${data.slug}`}
            className="font-body-md text-body-md text-secondary underline"
          >
            Ver en la tienda
          </Link>
        ) : (
          <p className="font-body-md text-body-md text-text-muted">Sin publicar.</p>
        )}
      </header>

      <EditorPagina pagina={data as PaginaUI} />
    </div>
  )
}
