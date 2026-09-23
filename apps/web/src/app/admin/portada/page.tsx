import { createServerSupabase } from '@/lib/supabase/server'
import { EditorPortada, type HeroUI, type SeccionUI } from './Editor.tsx'

/**
 * La portada.
 *
 * Hasta la migración 0053, los cinco bloques de la página de inicio estaban
 * escritos en el JSX de `(storefront)/page.tsx` — con sus antetítulos, sus
 * enlaces y el párrafo entero de «Nuestra casa». Era la mayor desviación de la
 * regla 2 del proyecto, y justo en la página que primero se quiere cambiar.
 *
 * Se leen TODAS las secciones, también las apagadas: esta pantalla es donde se
 * vuelven a encender, así que esconderlas las dejaría irrecuperables. El hero
 * igual — la consulta pública lo filtra por fecha y por `is_active`; aquí no.
 */
export default async function PortadaPage() {
  const supabase = await createServerSupabase()

  const [heroRes, seccionesRes] = await Promise.all([
    supabase
      .from('hero_slides')
      .select('id, image_path, image_alt, eyebrow, title, subtitle, cta_label, cta_href, secondary_cta_label, secondary_cta_href, is_active')
      .eq('page_key', 'home')
      .order('position')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('page_sections')
      .select('id, type, eyebrow, title, subtitle, config, position, is_active')
      .eq('page_key', 'home')
      .order('position'),
  ])

  if (seccionesRes.error) {
    return (
      <p className="border border-primary px-3 py-2 font-body-md text-body-md text-primary">
        {seccionesRes.error.message}
      </p>
    )
  }

  const secciones: SeccionUI[] = (seccionesRes.data ?? []).map((s) => ({
    ...s,
    config: (s.config ?? {}) as Record<string, unknown>,
  }))

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="font-headline-md text-headline-md text-primary">Portada</h1>
        <p className="font-body-md text-body-md text-text-muted">
          La imagen grande y los bloques del inicio. Los cambios se ven al recargar la tienda.
        </p>
      </header>

      <EditorPortada hero={(heroRes.data as HeroUI | null) ?? null} secciones={secciones} />
    </div>
  )
}
