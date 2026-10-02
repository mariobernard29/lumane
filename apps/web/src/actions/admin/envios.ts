'use server'

import { revalidatePath } from 'next/cache'

import { createServerSupabase } from '@/lib/supabase/server'
import type { ResultadoAdmin } from './contenido.ts'

/**
 * Los precios de la entrega local, tramo por tramo.
 *
 * Solo el PRECIO. Los kilómetros de cada tramo los fija la 0069 y no se tocan
 * desde aquí: el último tramo termina en 10 km, y eso es lo que define hasta
 * dónde llega la entrega local. Un campo de «hasta km» en el panel movería la
 * zona de cobertura sin que quien lo edita lo vea así.
 *
 * Como el resto del panel, con la sesión y no con la llave de servicio: RLS
 * exige `cms.write` en `local_delivery_rates`, y cada update lleva `.select()`
 * para distinguir «guardado» de «RLS lo filtró en silencio».
 */

/** Pesos a centavos. `null` = vacío o no es un número válido. */
function aCentavos(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? '').trim().replace(/[$,\s]/g, '')
  if (s === '') return null
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

export async function guardarTarifasLocales(formData: FormData): Promise<ResultadoAdmin> {
  // Cada tramo llega como `precio:<id>`. Se leen del formulario en vez de
  // recibir una lista aparte para que el envío funcione sin JavaScript.
  const cambios: { id: string; cents: number }[] = []
  for (const [clave, valor] of formData.entries()) {
    if (!clave.startsWith('precio:')) continue
    const cents = aCentavos(valor)
    if (cents === null) {
      return { ok: false, mensaje: 'Cada tramo necesita un precio válido (puede ser 0).' }
    }
    cambios.push({ id: clave.slice('precio:'.length), cents })
  }

  if (cambios.length === 0) return { ok: false, mensaje: 'No llegó ningún tramo.' }

  const supabase = await createServerSupabase()
  const resultados = await Promise.all(
    cambios.map((c) =>
      supabase
        .from('local_delivery_rates')
        .update({ price_cents: c.cents })
        .eq('id', c.id)
        .select('id'),
    ),
  )

  const fallo = resultados.find((r) => r.error)
  if (fallo?.error) return { ok: false, mensaje: fallo.error.message }
  if (resultados.some((r) => !r.data?.length)) {
    return { ok: false, mensaje: 'No tienes permiso para cambiar las tarifas de envío.' }
  }

  revalidatePath('/admin/envios')
  return { ok: true, mensaje: 'Tarifas guardadas. El pago ya cobra los precios nuevos.' }
}
