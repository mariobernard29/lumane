import Link from 'next/link'

import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Las páginas de contenido del sitio.
 *
 * Se listan TODAS, también las despublicadas: esta pantalla es donde se
 * vuelven a publicar, y esconderlas las dejaría inalcanzables.
 */

const PLANTILLAS: Record<string, string> = {
  prose: 'Texto',
  faq: 'Preguntas frecuentes',
  contact: 'Contacto',
}

export default async function PaginasPage() {
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('pages')
    .select('id, slug, title, template, is_published, updated_at')
    .order('title')

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="font-headline-md text-headline-md text-primary">Páginas</h1>
        <p className="font-body-md text-body-md text-text-muted">
          Los textos del sitio: historia, envíos, privacidad, guía de tallas. Se escriben en
          Markdown.
        </p>
      </header>

      <Link
        href="/admin/faq"
        className="border border-outline-variant bg-paper-bright px-4 py-3 font-body-md text-body-md text-primary hover:border-primary"
      >
        Preguntas frecuentes →
        <span className="block font-body-md text-body-md text-text-muted">
          Las preguntas viven en su propia tabla, no en el texto de la página.
        </span>
      </Link>

      {error ? (
        <p className="border border-primary px-3 py-2 font-body-md text-body-md text-primary">
          {error.message}
        </p>
      ) : null}

      <ul className="grid gap-2">
        {(data ?? []).map((p) => (
          <li key={p.id}>
            <Link
              href={`/admin/paginas/${p.id}`}
              className="flex flex-wrap items-baseline justify-between gap-2 border border-outline-variant bg-paper-bright px-4 py-3 hover:border-primary"
            >
              <span className="grid gap-0.5">
                <span className="font-body-md text-body-lg text-primary">{p.title}</span>
                <span className="font-body-md text-body-md text-text-muted">{`/p/${p.slug}`}</span>
              </span>
              <span className="font-label-upper text-label-upper text-secondary">
                {`${PLANTILLAS[p.template] ?? p.template}${p.is_published ? '' : ' · sin publicar'}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
