import Link from 'next/link'
import Image from 'next/image'
import { BUCKETS } from '@lumane/db'
// `formatPrice` viene de ui-web y no de @lumane/core: apps/web no depende de
// core, y ui-web lo reexporta con la misma implementación.
import { formatPrice } from '@lumane/ui-web'

import { storageUrl } from '@/lib/images'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * El catálogo.
 *
 * Una fila por prenda con su foto, porque una boutique reconoce sus prendas
 * por la foto antes que por el nombre. El rango de precios y el número de
 * variantes van al lado: son las dos preguntas que se hacen al buscar una
 * prenda para corregirla.
 *
 * El filtro por omisión es «Todas» y no «Activas», al revés que la bandeja de
 * pedidos: aquí se viene a arreglar algo concreto, y esconder los borradores
 * haría desaparecer justo lo que se está preparando.
 */

const ESTADOS: Record<string, string> = {
  draft: 'Borrador',
  active: 'Publicada',
  archived: 'Archivada',
}

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string }>
}) {
  const { q = '', estado = '' } = await searchParams
  const supabase = await createServerSupabase()

  let consulta = supabase
    .from('products')
    .select('id, name, slug, status, is_online, product_variants(id, price_cents, is_active), product_images(storage_path, position)')
    .order('updated_at', { ascending: false })
    .limit(100)

  if (q.trim() !== '') consulta = consulta.ilike('name', `%${q.trim()}%`)
  if (estado !== '') consulta = consulta.eq('status', estado as 'draft' | 'active' | 'archived')

  const { data, error } = await consulta

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="font-headline-md text-headline-md text-primary">Catálogo</h1>
        <p className="font-body-md text-body-md text-text-muted">
          Prendas, precios y fotografía. Solo se ven en la tienda las publicadas.
        </p>
      </header>

      <form className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <label htmlFor="q" className="font-label-upper text-label-upper text-secondary">
            Buscar
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Nombre de la prenda"
            className="border border-outline-variant bg-paper-bright px-3 py-2.5 font-body-md text-body-md text-primary outline-none focus:border-primary"
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor="estado" className="font-label-upper text-label-upper text-secondary">
            Estado
          </label>
          <select
            id="estado"
            name="estado"
            defaultValue={estado}
            className="border border-outline-variant bg-paper-bright px-3 py-2.5 font-body-md text-body-md text-primary outline-none focus:border-primary"
          >
            <option value="">Todas</option>
            <option value="active">Publicadas</option>
            <option value="draft">Borradores</option>
            <option value="archived">Archivadas</option>
          </select>
        </div>
        <button
          type="submit"
          className="border border-primary px-5 py-2.5 font-label-upper text-label-upper text-primary"
        >
          Filtrar
        </button>
      </form>

      {error ? (
        <p className="border border-primary px-3 py-2 font-body-md text-body-md text-primary">
          {error.message}
        </p>
      ) : null}

      <ul className="grid gap-2">
        {(data ?? []).map((p) => {
          const variantes = p.product_variants ?? []
          const precios = variantes.map((v) => Number(v.price_cents)).sort((a, b) => a - b)
          const portada = [...(p.product_images ?? [])].sort((a, b) => a.position - b.position)[0]

          return (
            <li key={p.id}>
              <Link
                href={`/admin/catalogo/${p.id}`}
                className="flex items-center gap-4 border border-outline-variant bg-paper-bright p-3 hover:border-primary"
              >
                <div className="relative size-16 shrink-0 bg-surface">
                  <Image
                    src={storageUrl(portada?.storage_path, BUCKETS.products)}
                    alt=""
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                </div>

                <div className="grid flex-1 gap-0.5">
                  <span className="font-body-md text-body-lg text-primary">{p.name}</span>
                  <span className="font-body-md text-body-md text-text-muted">
                    {`${ESTADOS[p.status] ?? p.status}${p.is_online ? '' : ' · fuera de la tienda'} · ${variantes.length} ${variantes.length === 1 ? 'variante' : 'variantes'}`}
                  </span>
                </div>

                <span className="font-price text-price text-primary">
                  {precios.length === 0
                    ? '—'
                    : precios[0] === precios.at(-1)
                      ? formatPrice(precios[0]!)
                      : `${formatPrice(precios[0]!)} – ${formatPrice(precios.at(-1)!)}`}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>

      {(data ?? []).length === 0 && !error ? (
        <p className="font-body-md text-body-md text-text-muted">
          {q.trim() !== '' || estado !== ''
            ? 'Ninguna prenda coincide con ese filtro.'
            : 'Todavía no hay prendas.'}
        </p>
      ) : null}
    </div>
  )
}
