import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { formatPrice } from '@lumane/core'
import { errorMessage } from '@lumane/db'

import { supabase } from '@/lib/supabase'
import { useSession } from '@/lib/session'
import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { color, s, space, text } from '@/theme'
import {
  ESTADOS,
  accion,
  etiqueta,
  sinGuia,
  siguientePaso,
  tipoEntrega,
  type OrderStatus,
  type TipoEntrega,
} from './estados.ts'

/**
 * La ficha de un pedido en línea, desde el mostrador.
 *
 * Lo que la encargada tiene que poder hacer sin pensar: ver qué piezas juntar,
 * a dónde va, y pulsar el botón del siguiente paso. Todo lo demás —pagos,
 * bitácora— está abajo, para cuando algo no cuadra.
 *
 * Los botones que se pintan salen de `ESTADOS[status].avances`, que es un
 * espejo de la máquina de la base. La autoridad es el trigger de la 0045: si
 * este archivo se equivoca, la base rechaza y se enseña su mensaje.
 */

interface Linea {
  id: string
  product_name: string
  variant_title: string | null
  sku: string | null
  quantity: number
  total_cents: number
}

interface Ficha {
  order: {
    id: string
    order_number: string
    status: OrderStatus
    payment_status: string
    total_cents: number
    subtotal_cents: number
    shipping_cents: number
    tax_cents: number
    placed_at: string | null
    note: string | null
    shipping_address: Record<string, unknown> | null
    shipping_method_snapshot: Record<string, unknown> | null
  }
  lines: Linea[]
  payments: { method: string; amount_cents: number; status: string | null }[]
  customer: { first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null
  shipment: { carrier: string | null; tracking_number: string | null; shipped_at: string | null } | null
  events: { from_status: string | null; to_status: string; created_at: string }[]
}

function direccion(a: Record<string, unknown> | null): string[] {
  if (!a) return []
  const calle = [a.street, a.ext_no].filter(Boolean).join(' ')
  const interior = a.int_no ? `Int. ${String(a.int_no)}` : ''
  const cp = [a.postal_code, a.city].filter(Boolean).join(' ')
  return [
    String(a.recipient ?? ''),
    [calle, interior].filter(Boolean).join(', '),
    String(a.neighborhood ?? ''),
    [cp, a.state].filter(Boolean).join(', '),
    String(a.phone ?? ''),
  ].filter((l) => l.trim() !== '')
}

export function OrderSheet({
  orderId,
  onClose,
  onCambio,
}: {
  orderId: string
  onClose: () => void
  /** Se llama tras cualquier cambio, para que la lista de atrás se refresque. */
  onCambio: () => void
}) {
  const { can } = useSession()
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Ninguno | 'shipped' | 'cancelled': qué sub-formulario está abierto. */
  const [pidiendo, setPidiendo] = useState<OrderStatus | null>(null)
  const [transportista, setTransportista] = useState('')
  const [guia, setGuia] = useState('')
  const [motivo, setMotivo] = useState('')

  const cargar = useCallback(async () => {
    const { data, error: fallo } = await supabase.rpc('get_staff_order', { p_order_id: orderId })
    setCargando(false)
    if (fallo) {
      setError(errorMessage(fallo))
      return
    }
    setFicha(data as unknown as Ficha)
  }, [orderId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  /**
   * Avanzar de estado es un UPDATE de una columna, no un RPC.
   *
   * La RLS ya lo autoriza con `orders.fulfill`, el trigger de la 0007 escribe
   * la bitácora, el de la 0010 emite el correo y el de la 0045 impide los
   * saltos. Es la única consulta directa a tabla de todo el POS, y es
   * deliberada: envolverla en un RPC sería una cuarta capa repitiendo a las
   * otras tres.
   */
  const avanzar = useCallback(
    async (destino: OrderStatus) => {
      setOcupado(true)
      setError(null)
      const { error: fallo } = await supabase.from('orders').update({ status: destino }).eq('id', orderId)
      setOcupado(false)
      if (fallo) {
        setError(errorMessage(fallo))
        return
      }
      await cargar()
      onCambio()
    },
    [orderId, cargar, onCambio],
  )

  /**
   * `directo`: entrega local o recoger en boutique, así que no hay guía. Pasa por el
   * mismo RPC para que quede la fila del envío con su hora de salida, y el
   * correo de «va en camino» ya sabe callarse el bloque de rastreo sin guía.
   */
  const enviar = useCallback(async (directo: TipoEntrega | null = null) => {
    if (!directo && guia.trim() === '') {
      setError('Escribe el número de guía antes de marcarlo enviado')
      return
    }
    setOcupado(true)
    setError(null)
    const { error: fallo } = await supabase.rpc('pos_ship_order', {
      p_payload: directo
        ? {
            order_id: orderId,
            carrier: directo === 'pickup' ? 'Recoger en boutique' : 'Entrega local',
            tracking_number: null,
          }
        : {
            order_id: orderId,
            carrier: transportista.trim() || null,
            tracking_number: guia.trim(),
          },
    })
    setOcupado(false)
    if (fallo) {
      setError(errorMessage(fallo))
      return
    }
    setPidiendo(null)
    setGuia('')
    setTransportista('')
    await cargar()
    onCambio()
  }, [orderId, guia, transportista, cargar, onCambio])

  const cancelar = useCallback(async () => {
    setOcupado(true)
    setError(null)
    const { error: fallo } = await supabase.rpc('cancel_order', {
      p_order_id: orderId,
      p_reason: motivo.trim() || undefined,
    })
    setOcupado(false)
    if (fallo) {
      setError(errorMessage(fallo))
      return
    }
    setPidiendo(null)
    setMotivo('')
    await cargar()
    onCambio()
  }, [orderId, motivo, cargar, onCambio])

  if (cargando || !ficha) {
    return (
      <Sheet eyebrow="Pedido" title={cargando ? 'Abriendo…' : 'No se pudo abrir'} onClose={onClose} error={error}>
        <View />
      </Sheet>
    )
  }

  const { order } = ficha
  const estado = ESTADOS[order.status]
  const tipo = tipoEntrega(order.shipping_method_snapshot)
  const siguiente = siguientePaso(order.status, tipo)
  const puedeCumplir = can('orders.fulfill')
  const señas = direccion(order.shipping_address)

  // El sub-formulario reemplaza al botón de acción del pie mientras está
  // abierto: dos botones de acción a la vez es cómo se cobra de más.
  const accionPie =
    pidiendo === 'shipped'
      ? { label: 'Confirmar envío', onPress: () => void enviar(), loading: ocupado }
      : pidiendo === 'cancelled'
        ? { label: 'Confirmar cancelación', onPress: () => void cancelar(), loading: ocupado, variant: 'danger' as const }
        : undefined

  return (
    <Sheet
      eyebrow={`Pedido ${order.order_number}`}
      title={etiqueta(order.status, tipo)}
      onClose={onClose}
      closeLabel={pidiendo ? 'Cancelar' : 'Volver'}
      action={accionPie}
      error={error}
    >
      {siguiente ? <Text style={s.bodyMuted}>{siguiente}</Text> : null}

      {/* ---- Qué juntar ---- */}
      <View style={o.bloque}>
        <Text style={s.label}>Piezas</Text>
        {ficha.lines.map((l) => (
          <View key={l.id} style={s.rowBetween}>
            <View style={s.fill}>
              <Text style={s.body}>
                {l.product_name}
                {l.variant_title ? <Text style={s.bodyMuted}>{` · ${l.variant_title}`}</Text> : null}
              </Text>
              {l.sku ? <Text style={o.sku}>{l.sku}</Text> : null}
            </View>
            <Text style={s.body}>{`×${l.quantity}`}</Text>
            <Text style={[s.price, o.importe]}>{formatPrice(l.total_cents, true)}</Text>
          </View>
        ))}
        <View style={s.rule} />
        <View style={s.rowBetween}>
          <Text style={s.labelStrong}>Total</Text>
          <Text style={s.price}>{formatPrice(order.total_cents, true)}</Text>
        </View>
      </View>

      {/* ---- A dónde va ---- */}
      {señas.length > 0 || order.shipping_method_snapshot?.name ? (
        <View style={o.bloque}>
          <Text style={s.label}>Entrega</Text>
          {order.shipping_method_snapshot?.name ? (
            <Text style={s.body}>{String(order.shipping_method_snapshot.name)}</Text>
          ) : null}
          {señas.map((linea) => (
            <Text key={linea} style={s.bodyMuted}>
              {linea}
            </Text>
          ))}
        </View>
      ) : null}

      {order.note ? (
        <View style={o.bloque}>
          <Text style={s.label}>Nota</Text>
          <Text style={s.body}>{order.note}</Text>
        </View>
      ) : null}

      {ficha.shipment?.tracking_number ? (
        <View style={o.guia}>
          <Text style={s.label}>Guía</Text>
          <Text style={s.body}>
            {[ficha.shipment.carrier, ficha.shipment.tracking_number].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ) : null}

      {/* ---- Sub-formularios ---- */}
      {pidiendo === 'shipped' ? (
        <View style={o.bloque}>
          <Field label="Transportista" value={transportista} onChangeText={setTransportista} editable={!ocupado} />
          <Field
            label="Número de guía"
            value={guia}
            onChangeText={setGuia}
            autoCapitalize="characters"
            editable={!ocupado}
            hint="Va dentro del correo que recibe la clienta, así que revísalo antes de confirmar."
          />
        </View>
      ) : null}

      {pidiendo === 'cancelled' ? (
        <View style={o.bloque}>
          <Field
            label="Motivo"
            value={motivo}
            onChangeText={setMotivo}
            editable={!ocupado}
            hint="Se guarda en el pedido y las piezas vuelven al inventario."
          />
        </View>
      ) : null}

      {/* ---- Qué se puede hacer ahora ---- */}
      {puedeCumplir && !pidiendo ? (
        <View style={o.acciones}>
          {estado.avances.map((destino) => (
            <Button
              key={destino}
              label={accion(destino, tipo)}
              variant={destino === 'cancelled' ? 'outline' : 'solid'}
              size="lg"
              fullWidth
              disabled={ocupado}
              loading={ocupado && sinGuia(tipo) && destino === 'shipped'}
              onPress={() => {
                // Entrega local y recoger en boutique no llevan guía: va directo.
                if (destino === 'shipped' && sinGuia(tipo)) {
                  void enviar(tipo)
                  return
                }
                // Enviar y cancelar piden un dato antes; el resto es directo.
                if (destino === 'shipped' || destino === 'cancelled') {
                  setError(null)
                  setPidiendo(destino)
                  return
                }
                void avanzar(destino)
              }}
            />
          ))}
        </View>
      ) : null}

      {/* ---- Bitácora: abajo, para cuando algo no cuadra ---- */}
      <View style={o.bloque}>
        <Text style={s.label}>Historial</Text>
        {ficha.events.map((e) => (
          <Text key={`${e.to_status}-${e.created_at}`} style={o.evento}>
            {`${new Intl.DateTimeFormat('es-MX', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'America/Mazatlan',
            }).format(new Date(e.created_at))} · ${etiqueta(e.to_status as OrderStatus, tipo)}`}
          </Text>
        ))}
      </View>
    </Sheet>
  )
}

const o = StyleSheet.create({
  bloque: { gap: space.gap },
  acciones: { gap: space.gap },
  importe: { minWidth: 96, textAlign: 'right' },
  sku: { ...text.labelUpper, fontSize: 10, color: color['text-muted'] },
  evento: { ...text.bodyMd, fontSize: 13, color: color['text-muted'] },
  guia: {
    borderWidth: 1,
    borderColor: color.primary,
    padding: space.gutter,
    gap: 2,
  },
})
