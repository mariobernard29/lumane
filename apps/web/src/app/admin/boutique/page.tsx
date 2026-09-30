import Link from 'next/link'

import { createServerSupabase } from '@/lib/supabase/server'
import { StatusNote } from '@/components/admin/primitivos'
import { Galeria, type FotoUI } from './Galeria.tsx'

/**
 * Las fotos de la boutique.
 *
 * Solo las fotos. La dirección se edita en Supabase —vive en `locations`
 * porque también la usa el cotizador de entrega local— y el texto de la
 * página, en Páginas. Poner aquí tres cosas que viven en tres sitios
 * distintos daría un formulario que guarda unas y otras no.
 */
export default async function BoutiquePage() {
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('hero_slides')
    .select('id, image_path, image_alt')
    .eq('page_key', 'boutique')
    .order('position')

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="font-headline-md text-headline-md text-primary">La boutique</h1>
        <p className="font-body-md text-body-md text-text-muted">
          Las fotos del local, tal como se ven en{' '}
          <Link href="/p/la-boutique" className="underline underline-offset-4">
            la página de la tienda
          </Link>
          .
        </p>
      </header>

      {error ? <StatusNote>{error.message}</StatusNote> : null}

      <Galeria fotos={(data ?? []) as FotoUI[]} />

      <p className="font-body-md text-[13px] text-text-muted border-t border-surface-variant pt-4">
        El texto de la página se edita en <strong>Páginas → La boutique</strong>. La dirección y el
        horario salen de los datos de la sucursal y de <strong>Ajustes</strong>.
      </p>
    </div>
  )
}
