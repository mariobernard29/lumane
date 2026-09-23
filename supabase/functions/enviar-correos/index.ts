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
): Promise<string> {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from: EMAIL_FROM, to: [destinatario], subject: asunto, html, text: texto }),
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

async function procesar(ev: Evento): Promise<Resultado> {
  const orderId = ev.payload?.order_id as string | undefined
  if (!orderId) return { estado: 'omitido', detalle: `evento ${ev.topic} sin order_id` }

  const { data: carga, error } = await supabase.rpc('order_email_payload', { p_order_id: orderId })
  if (error) throw new Error(`order_email_payload: ${error.message}`)
  if (!carga) return { estado: 'omitido', detalle: `el pedido ${orderId} ya no existe` }

  const c = carga as Carga

  // Una venta de mostrador sin clienta asociada no tiene a quién escribirle.
  // No es un error del worker: es lo normal en el 90 % de las ventas del POS.
  const destinatario = c.customer?.email?.trim()
  if (!destinatario) return { estado: 'omitido', detalle: `pedido ${c.order.number} sin correo de clienta` }

  const correo = plantillaPara(ev.topic, (ev.payload?.to_status as string) ?? null, c)
  if (!correo) {
    return {
      estado: 'omitido',
      detalle: `${ev.topic} → ${ev.payload?.to_status ?? '—'} no lleva correo`,
    }
  }

  const id = await mandarPorResend(destinatario, correo.asunto, correo.html, correo.texto)
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
