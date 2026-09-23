import { createServerSupabase } from '@/lib/supabase/server'
import { EditorMenus, type MenuUI } from './Editor.tsx'

/**
 * Los menús del sitio.
 *
 * Hasta la migración 0052, los títulos de las columnas del pie estaban
 * escritos en `lib/queries/layout.ts` — un objeto con «Tienda», «Ayuda» y «La
 * casa» que también decidía cuáles eran columnas y en qué orden. Ahora las
 * tres cosas salen de `navigation_menus`, y esta pantalla es donde se cambian.
 */
export default async function MenusPage() {
  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from('navigation_menus')
    .select('id, key, name, position, navigation_items(id, label, href, position, is_visible, is_emphasized)')
    .order('position')

  if (error) {
    return (
      <p className="font-body-md text-body-md text-primary">
        No se pudieron leer los menús: {error.message}
      </p>
    )
  }

  // El header primero, y luego las columnas del pie por su orden. Es el orden
  // en que se ven en el sitio, que es como conviene editarlos.
  const menus: MenuUI[] = (data ?? [])
    .sort((a, b) => (a.key === 'header' ? -1 : b.key === 'header' ? 1 : a.position - b.position))
    .map((m) => ({
      id: m.id,
      key: m.key,
      name: m.name,
      items: [...(m.navigation_items ?? [])].sort((a, b) => a.position - b.position),
    }))

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="font-headline-md text-headline-md text-primary">Menús</h1>
        <p className="font-body-md text-body-md text-text-muted">
          La navegación de arriba y las columnas del pie. Los cambios se ven en la tienda al
          instante.
        </p>
      </header>

      <EditorMenus menus={menus} />
    </div>
  )
}
