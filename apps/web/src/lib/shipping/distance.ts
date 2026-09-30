import 'server-only'

import { createServerSupabase } from '../supabase/server.ts'

/**
 * Distancia por carretera entre la boutique y la dirección de entrega.
 *
 * Vive en el servidor porque la llave de Google Distance Matrix NO puede
 * llegar al navegador: allí cualquiera podría copiarla y facturarle consultas a
 * Lumane. Es una llave distinta de la de Places Autocomplete, que sí es de
 * navegador y va restringida por dominio.
 *
 * Cada consulta se cachea en `shipping_quotes`: la distancia entre dos puntos
 * fijos no cambia, y Google cobra por llamada.
 */

export interface DistanceResult {
  meters: number
  seconds: number | null
  /** true = salió de la caché, no se llamó a Google. */
  cached: boolean
}

/**
 * Redondeo a ~11 m: dos direcciones de la misma cuadra comparten caché.
 *
 * **El origen entra en la clave, no solo el destino.** Antes no estaba, y eso
 * convertía una coordenada mal capturada en un error permanente: al corregir
 * `locations.lat/lng` las cotizaciones viejas seguían sirviéndose desde la
 * caché, calculadas desde el punto equivocado, sin forma de notarlo.
 *
 * Ya pasó una vez. La sucursal arrastraba el centro de Los Mochis como
 * marcador de posición —a un kilómetro largo del local— y se corrigió en la
 * migración 0061. No llegó a hacer daño solo porque sin `GOOGLE_MAPS_SERVER_KEY`
 * nunca se guardó ni una fila, pero el fallo estaba servido.
 */
function addressHash(
  locationId: string,
  origin: { lat: number; lng: number },
  lat: number,
  lng: number,
): string {
  return `${locationId}:${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}:${lat.toFixed(4)}:${lng.toFixed(4)}`
}

export async function getDrivingDistance(
  locationId: string,
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Promise<DistanceResult | null> {
  const supabase = await createServerSupabase()
  const hash = addressHash(locationId, origin, destination.lat, destination.lng)

  const { data: cachedRow } = await supabase
    .from('shipping_quotes')
    .select('distance_meters, duration_seconds')
    .eq('address_hash', hash)
    .maybeSingle()

  if (cachedRow) {
    return {
      meters: cachedRow.distance_meters,
      seconds: cachedRow.duration_seconds,
      cached: true,
    }
  }

  const key = process.env.GOOGLE_MAPS_SERVER_KEY
  if (!key) {
    console.warn('[envio-local] falta GOOGLE_MAPS_SERVER_KEY: no se puede cotizar por distancia')
    return null
  }

  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json')
  url.searchParams.set('origins', `${origin.lat},${origin.lng}`)
  url.searchParams.set('destinations', `${destination.lat},${destination.lng}`)
  url.searchParams.set('mode', 'driving')
  url.searchParams.set('language', 'es-MX')
  url.searchParams.set('region', 'mx')
  url.searchParams.set('key', key)

  try {
    const response = await fetch(url, { cache: 'no-store' })
    const payload = (await response.json()) as {
      status: string
      rows?: { elements?: { status: string; distance?: { value: number }; duration?: { value: number } }[] }[]
    }

    const element = payload.rows?.[0]?.elements?.[0]
    if (payload.status !== 'OK' || !element || element.status !== 'OK' || !element.distance) {
      console.warn('[envio-local] Distance Matrix sin ruta:', payload.status, element?.status)
      return null
    }

    const result: DistanceResult = {
      meters: element.distance.value,
      seconds: element.duration?.value ?? null,
      cached: false,
    }

    // La caché es una optimización: si falla, la cotización sigue siendo válida.
    await supabase.from('shipping_quotes').upsert(
      {
        address_hash: hash,
        location_id: locationId,
        lat: destination.lat,
        lng: destination.lng,
        distance_meters: result.meters,
        duration_seconds: result.seconds,
      },
      { onConflict: 'address_hash' },
    )

    return result
  } catch (error) {
    console.error('[envio-local] Distance Matrix falló:', error)
    return null
  }
}
