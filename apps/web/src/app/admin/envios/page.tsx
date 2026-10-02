import { formatPrice } from '@lumane/ui-web'

import { createServerSupabase } from '@/lib/supabase/server'
import { FormularioTarifas, type Tramo } from './Formulario.tsx'

/**
 * Tarifas de la entrega local.
 *
 * Cinco tramos de 2 km hasta 10 km (migración 0069). Aquí se cambia lo que
 * cuesta cada uno; los límites no, porque son la zona de cobertura.
 */
export default async function EnviosPage() {
  const supabase = await createServerSupabase()

  const [{ data: tramos, error }, { data: ajustes }] = await Promise.all([
    supabase
      .from('local_delivery_rates')
      .select('id, min_km, max_km, price_cents, shipping_methods!inner(code)')
      .eq('shipping_methods.code', 'local')
      .order('min_km'),
    supabase.from('store_settings').select('free_shipping_over_cents').eq('id', true).maybeSingle(),
  ])

  if (error || !tramos?.length) {
    return (
      <p className="font-body-md text-body-md text-primary">
        No se pudieron leer las tarifas: {error?.message ?? 'no hay tramos de entrega local'}
      </p>
    )
  }

  const inicial: Tramo[] = tramos.map((t) => ({
    id: t.id,
    minKm: Number(t.min_km),
    maxKm: Number(t.max_km),
    pesos: t.price_cents / 100,
  }))
  const hasta = Math.max(...inicial.map((t) => t.maxKm))
  const gratisDesde = ajustes?.free_shipping_over_cents ?? null

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="font-headline-md text-headline-md text-primary">Envíos</h1>
        <p className="font-body-md text-body-md text-text-muted">
          Lo que cuesta la entrega local según la distancia en coche desde la boutique. La
          clienta la ve en cuanto elige su dirección en el pago, si está a {hasta} km o menos;
          más lejos, solo se le ofrece paquetería.
        </p>
        {gratisDesde != null ? (
          <p className="font-body-md text-body-md text-text-muted">
            En compras desde {formatPrice(gratisDesde)} la entrega local es gratis, igual que
            todos los envíos.
          </p>
        ) : null}
      </header>

      <FormularioTarifas tramos={inicial} />
    </div>
  )
}
