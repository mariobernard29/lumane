/**
 * El consumidor del outbox de Lumane.
 *
 * Pide un lote de eventos, arma el correo que toque y lo manda por Resend.
 * No decide nada más: a quién se escribe, con qué datos y cuándo se reintenta
 * lo resuelven `outbox_claim`, `order_email_payload` y `outbox_mark_*` en
 * Postgres. Esta función es transporte — la parte que puede caerse sin que se
 * pierda información, porque el evento sigue en la tabla hasta que alguien lo
 * cierre.
 *
 * Se invoca cada minuto desde pg_cron (migración 0042). También se puede
 * llamar a mano para vaciar la cola ya mismo.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { plantillaPara, type Carga } from './plantillas.ts'
import { plantillaAviso, type CargaAviso } from './avisos.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'LUMANE <contacto@lumane.mx>'

/** Cuántos por invocación. El cron corre cada minuto: no hace falta vaciar de golpe. */
const LOTE = 20

interface Evento {
  id: string
  topic: string
  payload: Record<string, unknown>
  attempts: number
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function mandarPorResend(
  destinatario: string,
  asunto: string,
  html: string,
  texto: string,
  /**
   * A dónde va la respuesta si la clienta pulsa «Responder». El remitente
   * (`EMAIL_FROM`, @lumane.mx) es solo de envío y no recibe correo: sin esto,
   * una respuesta se perdería sin que nadie se enterara.
   */
  responderA?: string | null,
): Promise<string> {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [destinatario],
      subject: asunto,
      html,
      text: texto,
      ...(responderA ? { reply_to: responderA } : {}),
    }),
  })

  const cuerpo = await r.text()
  if (!r.ok) {
    // El cuerpo de Resend dice si es una dirección inválida (permanente) o un
    // 429/5xx (pasajero). Se propaga entero para que quede en `last_error` y
    // se pueda diagnosticar sin volver a reproducir el fallo.
    throw new Error(`Resend ${r.status}: ${cuerpo.slice(0, 500)}`)
  }
  try {
    return (JSON.parse(cuerpo).id as string) ?? 'sin-id'
  } catch {
    return 'sin-id'
  }
}

interface Resultado {
  estado: 'enviado' | 'omitido'
  detalle: string
  /** Identificador del envío en Resend. Solo cuando se mandó algo. */
  ref?: string
}

/**
 * Los avisos internos (`admin.*`).
 *
 * Van por un camino aparte porque no son de una clienta: el destinatario sale
 * de `store_settings.admin_email` y los datos de `admin_email_payload`, que
 * según el tema arma un corte de caja, una lista de agotados o un pedido.
 *
 * Si el RPC devuelve `null` es que no hay correo de administración puesto, o
 * que el registro desapareció entre la emisión y el envío. Ninguna de las dos
 * es un fallo que reintentar: se omite y se cierra el evento.
 */
async function procesarAviso(ev: Evento): Promise<Resultado> {
  const { data, error } = await supabase.rpc('admin_email_payload', {
    p_topic: ev.topic,
    p_payload: ev.payload,
  })
  if (error) throw new Error(`admin_email_payload: ${error.message}`)
  if (!data) {
    return { estado: 'omitido', detalle: `${ev.topic} sin correo de administración o sin datos` }
  }

  const c = data as CargaAviso
  const correo = plantillaAviso(ev.topic, c)
  if (!correo) return { estado: 'omitido', detalle: `${ev.topic} no tiene plantilla o vino vacío` }

  const id = await mandarPorResend(c.admin_email, correo.asunto, correo.html, correo.texto)
  return { estado: 'enviado', detalle: `resend:${id}`, ref: id }
}

async function procesar(ev: Evento): Promise<Resultado> {
  if (ev.topic.startsWith('admin.')) return procesarAviso(ev)

  const orderId = ev.payload?.order_id as string | undefined
  if (!orderId) return { estado: 'omitido', detalle: `evento ${ev.topic} sin order_id` }

  const { data: carga, error } = await supabase.rpc('order_email_payload', { p_order_id: orderId })
  if (error) throw new Error(`order_email_payload: ${error.message}`)
  if (!carga) return { estado: 'omitido', detalle: `el pedido ${orderId} ya no existe` }

  const c = carga as Carga

  // El correo del evento manda sobre el de la ficha: un ticket se pide con una
  // dirección concreta —la que la clienta dictó en el mostrador— y puede no ser
  // la que tiene guardada, o puede que no tenga ninguna.
  //
  // Para el resto de eventos no hay `email` en la carga y se usa el de la
  // ficha. Una venta de mostrador sin clienta no tiene a quién escribirle, y
  // eso no es un error del worker: es lo normal en el mostrador.
  const delEvento = (ev.payload?.email as string | undefined)?.trim()
  const destinatario = delEvento || c.customer?.email?.trim()
  if (!destinatario) return { estado: 'omitido', detalle: `pedido ${c.order.number} sin correo de clienta` }

  const correo = plantillaPara(ev.topic, (ev.payload?.to_status as string) ?? null, c)
  if (!correo) {
    return {
      estado: 'omitido',
      detalle: `${ev.topic} → ${ev.payload?.to_status ?? '—'} no lleva correo`,
    }
  }

  const id = await mandarPorResend(
    destinatario,
    correo.asunto,
    correo.html,
    correo.texto,
    c.store?.contact_email?.trim() || null,
  )
  return { estado: 'enviado', detalle: `resend:${id}`, ref: id }
}

Deno.serve(async () => {
  if (!RESEND_API_KEY) {
    // Sin llave no se reclama nada. Reclamar y fallar gastaría los intentos de
    // cada evento contra un problema de configuración que no se arregla solo.
    console.error('[correos] falta RESEND_API_KEY')
    return Response.json({ error: 'RESEND_API_KEY no configurada' }, { status: 500 })
  }

  const { data: eventos, error } = await supabase.rpc('outbox_claim', { p_limit: LOTE })
  if (error) {
    console.error('[correos] no se pudo reclamar el lote:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  const lote = (eventos ?? []) as Evento[]
  const resumen = { reclamados: lote.length, enviados: 0, omitidos: 0, fallidos: 0 }

  for (const ev of lote) {
    try {
      const r = await procesar(ev)
      if (r.estado === 'enviado') {
        // La referencia se guarda en la misma llamada que cierra el evento: si
        // se hiciera en dos pasos, un fallo entre ambos dejaría un correo
        // enviado del que no queda rastro, que es precisamente lo que esta
        // columna viene a evitar.
        await supabase.rpc('outbox_mark_sent', { p_id: ev.id, p_provider_ref: r.ref ?? null })
        resumen.enviados++
        console.log(`[correos] ${ev.topic} ${ev.id} enviado (${r.detalle})`)
      } else {
        await supabase.rpc('outbox_mark_skipped', { p_id: ev.id, p_reason: r.detalle })
        resumen.omitidos++
        console.log(`[correos] ${ev.topic} ${ev.id} omitido: ${r.detalle}`)
      }
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e)
      await supabase.rpc('outbox_mark_failed', { p_id: ev.id, p_error: mensaje })
      resumen.fallidos++
      console.error(`[correos] ${ev.topic} ${ev.id} falló: ${mensaje}`)
    }
  }

  return Response.json(resumen)
})
