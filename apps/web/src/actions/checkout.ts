'use server'

import { redirect } from 'next/navigation'
import { errorMessage } from '@lumane/db'
import { z } from 'zod'

import { readCartToken } from '@/lib/cart/session'
import { toTotals, type CartTotals } from '@/lib/queries/cart'
import { getDrivingDistance } from '@/lib/shipping/distance'
import { createAdminSupabase, createServerSupabase } from '@/lib/supabase/server'

/**
 * Acciones del checkout.
 *
 * Todo el dinero lo calcula la base. Aquí solo se traduce entre el formulario,
 * la cotización de distancia (que necesita una llave que no puede salir del
 * servidor) y los RPC.
 */

const addressSchema = z.object({
  recipient: z.string().min(2, 'Escribe el nombre de quien recibe'),
  street: z.string().min(3, 'Escribe la calle y el número'),
  extNo: z.string().optional().nullable(),
  intNo: z.string().optional().nullable(),
  neighborhood: z.string().optional().nullable(),
  city: z.string().min(2, 'Escribe la ciudad'),
  state: z.string().min(2, 'Escribe el estado'),
  postalCode: z.string().regex(/^\d{5}$/, 'El código postal son 5 dígitos'),
  country: z.string().default('MX'),
  phone: z.string().min(10, 'Escribe un teléfono de 10 dígitos'),
  deliveryNotes: z.string().optional().nullable(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
})

export type CheckoutAddress = z.infer<typeof addressSchema>

export interface QuoteResult {
  ok: boolean
  totals?: CartTotals
  /** Kilómetros hasta la boutique, cuando aplica la entrega local. Para mostrar. */
  distanceKm?: number | null
  /**
   * Los metros EXACTOS, para cobrar. No se reconstruyen desde `distanceKm`:
   * redondeado a 0.1 km, 1,999 m se vuelven 2,000 y caen en el tramo de
   * 2–4 km — la clienta vería $50 al cotizar y se le cobrarían $60.
   */
  distanceMeters?: number | null
  message?: string
}

type ServerSupabase = Awaited<ReturnType<typeof createServerSupabase>>

/**
 * Metros por carretera desde la boutique hasta unas coordenadas.
 *
 * Lo comparten la cotización y la comprobación de entrega local, que tienen
 * que medir exactamente igual: si una dijera 9.8 km y la otra 10.1, la
 * clienta vería ofrecida una entrega que luego no se le puede cobrar.
 */
async function metersFromBoutique(
  supabase: ServerSupabase,
  lat: number,
  lng: number,
): Promise<{ meters: number } | { message: string }> {
  const { data: location } = await supabase
    .from('locations')
    .select('id, lat, lng')
    .eq('is_default', true)
    .maybeSingle()

  if (!location?.lat || !location?.lng) {
    return { message: 'La boutique no tiene ubicación configurada' }
  }

  const distance = await getDrivingDistance(
    location.id,
    { lat: location.lat, lng: location.lng },
    { lat, lng },
  )

  if (!distance) {
    return { message: 'No pudimos calcular la distancia. Elige otro método de envío.' }
  }
  return { meters: distance.meters }
}

const toKm = (meters: number) => Math.round((meters / 1000) * 10) / 10

/**
 * Recalcula el resumen con el método de envío y el cupón elegidos.
 *
 * Para la entrega local hace falta la distancia: se resuelve aquí, en el
 * servidor, y se le pasa al RPC. La clienta nunca manda un costo de envío.
 */
export async function quoteCheckout(input: {
  shippingMethodCode: string | null
  couponCode: string | null
  lat?: number | null
  lng?: number | null
}): Promise<QuoteResult> {
  const token = await readCartToken()
  if (!token) return { ok: false, message: 'Tu bolsa está vacía' }

  const supabase = await createServerSupabase()

  let distanceMeters: number | null = null
  let distanceKm: number | null = null

  if (input.shippingMethodCode === 'local') {
    if (input.lat == null || input.lng == null) {
      return {
        ok: false,
        message: 'Necesitamos tu dirección exacta para calcular la entrega local',
      }
    }

    const distance = await metersFromBoutique(supabase, input.lat, input.lng)
    if ('message' in distance) return { ok: false, message: distance.message }

    distanceMeters = distance.meters
    distanceKm = toKm(distance.meters)
  }

  const { data, error } = await supabase.rpc('preview_checkout', {
    p_token: token,
    p_coupon_code: input.couponCode ?? undefined,
    p_shipping_method_code: input.shippingMethodCode ?? undefined,
    p_distance_meters: distanceMeters ?? undefined,
  })

  if (error || !data) {
    console.error('[checkout] preview_checkout falló:', error?.message)
    return { ok: false, message: errorMessage(error) }
  }

  const raw = data as unknown as { totals: Parameters<typeof toTotals>[0] }
  return { ok: true, totals: toTotals(raw.totals), distanceKm, distanceMeters }
}

export interface LocalDeliveryCheck {
  /** La dirección cae dentro de algún tramo de entrega local. */
  available: boolean
  distanceKm: number | null
  /** Lo que costaría la entrega local con la bolsa de ahora (0 = gratis). */
  shippingCents: number | null
  /** Hasta dónde llega la entrega local: el `max_km` del último tramo. */
  maxKm: number | null
  message?: string
}

const coordsSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  couponCode: z.string().nullable(),
})

/**
 * ¿Llega la entrega local a esta dirección, y cuánto costaría?
 *
 * La pregunta se hace en cuanto la clienta elige su dirección, ANTES de que
 * elija método: la entrega local solo se le ofrece si su dirección está dentro
 * de la zona. Enseñarla y rechazarla después sería peor que no enseñarla.
 *
 * El precio no se calcula aquí: se le pregunta a `preview_checkout` con el
 * método `local`, igual que al cotizar y al cobrar. Así el precio que ve en la
 * opción es el mismo que se cobra, umbral de envío gratis incluido.
 */
export async function checkLocalDelivery(input: {
  lat: number
  lng: number
  couponCode: string | null
}): Promise<LocalDeliveryCheck> {
  const none = { available: false, distanceKm: null, shippingCents: null, maxKm: null }

  const parsed = coordsSchema.safeParse(input)
  if (!parsed.success) return { ...none, message: 'Dirección no válida' }

  const token = await readCartToken()
  if (!token) return { ...none, message: 'Tu bolsa está vacía' }

  const supabase = await createServerSupabase()

  const [distance, { data: rates }] = await Promise.all([
    metersFromBoutique(supabase, parsed.data.lat, parsed.data.lng),
    supabase
      .from('local_delivery_rates')
      .select('max_km, shipping_methods!inner(code)')
      .eq('shipping_methods.code', 'local'),
  ])

  const maxKm = rates?.length ? Math.max(...rates.map((r) => Number(r.max_km))) : null
  if ('message' in distance) return { ...none, maxKm, message: distance.message }

  const { data, error } = await supabase.rpc('preview_checkout', {
    p_token: token,
    p_coupon_code: parsed.data.couponCode ?? undefined,
    p_shipping_method_code: 'local',
    p_distance_meters: distance.meters,
  })

  if (error || !data) {
    console.error('[checkout] preview_checkout (local) falló:', error?.message)
    return { ...none, maxKm, distanceKm: toKm(distance.meters), message: errorMessage(error) }
  }

  const totals = toTotals((data as unknown as { totals: Parameters<typeof toTotals>[0] }).totals)
  const available = totals.shippingAvailable !== false

  return {
    available,
    distanceKm: toKm(distance.meters),
    shippingCents: available ? totals.shippingCents : null,
    maxKm,
  }
}

const placeOrderSchema = z.object({
  email: z.email('Escribe un correo válido'),
  firstName: z.string().min(2, 'Escribe tu nombre'),
  lastName: z.string().optional().nullable(),
  shippingMethodCode: z.string().min(1, 'Elige un método de envío'),
  paymentMethod: z.enum(['stripe', 'transfer']),
  couponCode: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  acceptsMarketing: z.boolean().default(false),
  address: addressSchema,
})

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>

export interface PlaceOrderResult {
  ok: boolean
  message?: string
  orderNumber?: string
  guestToken?: string
}

/**
 * Cierra el pedido.
 *
 * Secuencia deliberada:
 *   1. Reservar el stock (RPC con bloqueo de fila). Si algo se agotó mientras
 *      la clienta llenaba el formulario, se entera AQUÍ y no después de pagar.
 *   2. Confirmar el pedido, que convierte la reserva en salida de inventario.
 *
 * `confirm_online_order` corre con la llave de servicio: es el paso que mueve
 * dinero e inventario y no puede quedar expuesto al navegador.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const parsed = placeOrderSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Revisa los datos' }
  }

  const token = await readCartToken()
  if (!token) return { ok: false, message: 'Tu bolsa está vacía' }

  const data = parsed.data
  const supabase = await createServerSupabase()

  // ---- 1. Reserva -----------------------------------------------------------
  const { error: reserveError } = await supabase.rpc('reserve_cart_stock', { p_token: token })
  if (reserveError) {
    return { ok: false, message: errorMessage(reserveError) }
  }

  // ---- 2. Totales definitivos ----------------------------------------------
  const quote = await quoteCheckout({
    shippingMethodCode: data.shippingMethodCode,
    couponCode: data.couponCode ?? null,
    lat: data.address.lat,
    lng: data.address.lng,
  })

  if (!quote.ok || !quote.totals) {
    await releaseReservation(token)
    return { ok: false, message: quote.message ?? 'No pudimos calcular el total' }
  }

  if (quote.totals.shippingAvailable === false) {
    await releaseReservation(token)
    return {
      ok: false,
      message: 'Ese método de envío no llega a tu dirección. Elige otro.',
    }
  }

  // ---- 3. Pago --------------------------------------------------------------
  // Esta acción cierra SOLO los pedidos por transferencia. El pago con tarjeta
  // no puede cerrarse desde el navegador —sería fiarse de quien compra— así que
  // va por `startCardPayment` y lo confirma el webhook de Stripe.
  if (data.paymentMethod === 'stripe') {
    await releaseReservation(token)
    return { ok: false, message: 'Usa el pago con tarjeta desde su propio formulario.' }
  }

  const payment = {
    method: 'transfer',
    amount_cents: quote.totals.totalCents,
    // Pendiente: la transferencia todavía no ha llegado. El pedido queda
    // registrado y la boutique lo confirma al ver el depósito.
    status: 'pending',
    provider: 'spei',
  }

  // ---- 4. Confirmación ------------------------------------------------------
  let admin
  try {
    admin = createAdminSupabase()
  } catch {
    await releaseReservation(token)
    return {
      ok: false,
      message: 'La tienda aún no puede cerrar pedidos. Escríbenos por WhatsApp y lo tomamos.',
    }
  }

  const distanceMeters = quote.distanceMeters ?? null

  const { data: result, error } = await admin.rpc('confirm_online_order', {
    p_cart_token: token,
    p_email: data.email,
    p_first_name: data.firstName,
    p_last_name: data.lastName ?? undefined,
    p_phone: data.address.phone,
    p_shipping_address: {
      recipient: data.address.recipient,
      street: data.address.street,
      ext_no: data.address.extNo,
      int_no: data.address.intNo,
      neighborhood: data.address.neighborhood,
      city: data.address.city,
      state: data.address.state,
      postal_code: data.address.postalCode,
      country: data.address.country,
      phone: data.address.phone,
      delivery_notes: data.address.deliveryNotes,
      lat: data.address.lat,
      lng: data.address.lng,
    },
    p_shipping_method_code: data.shippingMethodCode,
    p_payment: payment,
    p_distance_meters: distanceMeters ?? undefined,
    p_coupon_code: data.couponCode ?? undefined,
    p_note: data.note ?? undefined,
    p_accepts_marketing: data.acceptsMarketing,
  })

  if (error || !result) {
    console.error('[checkout] confirm_online_order falló:', error?.message)
    await releaseReservation(token)
    return { ok: false, message: errorMessage(error) }
  }

  const order = result as unknown as { order_number: string; guest_token: string }
  redirect(`/pedido/${order.order_number}?t=${order.guest_token}`)
}

/**
 * Devuelve el stock reservado cuando el pedido no llega a cerrarse.
 *
 * Sin esto, cada intento fallido dejaría piezas bloqueadas hasta que caducara
 * la reserva —veinte minutos en los que la boutique no puede venderlas.
 *
 * Usa el cliente NORMAL, con el token del carrito, no la llave de servicio.
 * La primera versión sí usaba la llave y tenía un fallo real: cuando el pedido
 * fallaba PORQUE faltaba esa llave, la limpieza fallaba por lo mismo y la pieza
 * se quedaba reservada. Una acción compensatoria no puede depender de más
 * privilegio que la operación que compensa.
 */
async function releaseReservation(token: string): Promise<void> {
  const supabase = await createServerSupabase()
  const { error } = await supabase.rpc('release_cart_stock', { p_token: token })
  if (error) {
    // Si aun así falla, el barrido de pg_cron lo recupera al caducar.
    console.error('[checkout] no se pudo liberar la reserva:', error.message)
  }
}
