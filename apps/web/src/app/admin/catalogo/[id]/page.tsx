import Link from 'next/link'
import { notFound } from 'next/navigation'

import { createServerSupabase } from '@/lib/supabase/server'
import { Ficha, type ProductoUI } from './Ficha.tsx'

/**
 * Una prenda.
 *
 * El inventario se lee pero no se edita: se trae de `inventory_levels` solo
 * para informar. Ajustarlo pasa por `adjust_inventory` en la tablet, que deja
 * un movimiento con motivo y autor en un ledger inmutable. Un campo de «stock»
 * editable aquí sería una forma de cambiar existencias sin que nadie sepa por
 * qué cambiaron, y el esquema lleva desde la Fase 0 impidiéndolo a propósito.
 */
export default async function ProductoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()

  const [productoRes, categoriasRes, stockRes] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, slug, short_description, long_description, fit_note, brand, status, is_online, primary_category_id, seo_title, seo_description, product_variants(id, title, sku, barcode, price_cents, compare_at_price_cents, is_active, position), product_images(id, storage_path, alt_text, position)')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('categories').select('id, name').order('position'),
    supabase.from('inventory_levels').select('variant_id, available'),
  ])

  if (productoRes.error) {
    return (
      <p className="border border-primary px-3 py-2 font-body-md text-body-md text-primary">
        {productoRes.error.message}
      </p>
    )
  }
  if (!productoRes.data) notFound()

  const p = productoRes.data
  const stock = new Map((stockRes.data ?? []).map((s) => [s.variant_id, s.available]))

  const producto: ProductoUI = {
    id: p.id,
    name: p.name,
    slug: p.slug,
    short_description: p.short_description,
    long_description: p.long_description,
    fit_note: p.fit_note,
    brand: p.brand,
    status: p.status,
    is_online: p.is_online,
    primary_category_id: p.primary_category_id,
    seo_title: p.seo_title,
    seo_description: p.seo_description,
    variantes: [...(p.product_variants ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((v) => ({
        id: v.id,
        title: v.title,
        sku: v.sku,
        barcode: v.barcode,
        price_cents: Number(v.price_cents),
        compare_at_price_cents:
          v.compare_at_price_cents == null ? null : Number(v.compare_at_price_cents),
        is_active: v.is_active,
        position: v.position,
        disponible: stock.get(v.id) ?? null,
      })),
    fotos: [...(p.product_images ?? [])].sort((a, b) => a.position - b.position),
  }

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <Link href="/admin/catalogo" className="font-label-upper text-label-upper text-secondary">
          ← Catálogo
        </Link>
        <h1 className="font-headline-md text-headline-md text-primary">{producto.name}</h1>
        {producto.status === 'active' ? (
          <Link
            href={`/producto/${producto.slug}`}
            className="font-body-md text-body-md text-secondary underline"
          >
            Ver en la tienda
          </Link>
        ) : (
          <p className="font-body-md text-body-md text-text-muted">
            No se ve en la tienda porque está en {producto.status === 'draft' ? 'borrador' : 'archivo'}.
          </p>
        )}
      </header>

      <Ficha producto={producto} categorias={categoriasRes.data ?? []} />
    </div>
  )
}
