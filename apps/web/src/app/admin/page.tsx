import Link from 'next/link'

import { getStaffProfile, puede } from '@/lib/queries/staff'
import { createServerSupabase } from '@/lib/supabase/server'
import { SECCIONES } from './secciones.ts'

/**
 * El índice del panel.
 *
 * Empieza por lo que reclama atención —pedidos sin atender, piezas agotadas— y
 * luego ofrece las secciones. Un panel que abre con un menú obliga a recordar
 * qué había que mirar; uno que abre con los avisos lo dice.
 */

async function avisos() {
  const supabase = await createServerSupabase()

  const [pedidos, stock] = await Promise.all([
    supabase.rpc('list_staff_orders', {
      p_channel: 'online',
      p_status: ['placed', 'preparing', 'packed'],
      p_limit: 100,
    }),
    // `v_stock_alerts` existe desde la Fase 0 y nadie la había leído nunca.
    supabase.from('v_stock_alerts').select('alert', { count: 'exact', head: true }),
  ])

  const items = (pedidos.data as unknown as { items: unknown[] } | null)?.items ?? []
  return { porAtender: items.length, alertas: stock.count ?? 0 }
}

export default async function AdminIndex() {
  const staff = await getStaffProfile()
  const { porAtender, alertas } = await avisos()
  const visibles = SECCIONES.filter((s) => puede(staff, s.permiso))

  return (
    <div className="grid gap-8">
      <section className="grid gap-3">
        <h1 className="font-headline-md text-headline-md text-primary">
          {`Hola, ${staff?.full_name?.split(' ')[0] ?? ''}`}
        </h1>

        <div className="grid gap-2 sm:grid-cols-2">
          <Aviso
            numero={porAtender}
            singular="pedido por atender"
            plural="pedidos por atender"
            vacio="Ningún pedido pendiente."
          />
          <Aviso
            numero={alertas}
            singular="pieza por agotarse"
            plural="piezas por agotarse"
            vacio="Sin alertas de inventario."
          />
        </div>

        <p className="font-body-md text-body-md text-text-muted">
          Los pedidos se atienden desde la tablet, en el módulo Pedidos.
        </p>
      </section>

      <section className="grid gap-3">
        <h2 className="font-label-upper text-label-upper text-secondary">Qué puedes cambiar</h2>
        <ul className="grid gap-2">
          {visibles.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="grid gap-0.5 border border-outline-variant bg-paper-bright px-4 py-3 hover:border-primary"
              >
                <span className="font-body-md text-body-lg text-primary">{s.label}</span>
                <span className="font-body-md text-body-md text-text-muted">{s.descripcion}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Aviso({
  numero,
  singular,
  plural,
  vacio,
}: {
  numero: number
  singular: string
  plural: string
  vacio: string
}) {
  return (
    <div className="border border-outline-variant bg-paper-bright px-4 py-3">
      {numero > 0 ? (
        <p className="font-body-md text-body-lg text-primary">
          <span className="font-price text-price">{numero}</span>{' '}
          {numero === 1 ? singular : plural}
        </p>
      ) : (
        <p className="font-body-md text-body-md text-text-muted">{vacio}</p>
      )}
    </div>
  )
}
