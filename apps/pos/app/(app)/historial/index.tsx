import { useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { formatPrice } from '@lumane/core'

import { useOrders } from '@/features/orders/OrdersContext'
import { useStaffOrders, type OrderRow } from '@/features/orders/useStaffOrders'
import { ReturnSheet } from '@/features/returns/ReturnSheet'
import { SaleDoneSheet } from '@/features/receipt/SaleDoneSheet'
import { useSession } from '@/lib/session'
import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { color, s, size, space, text } from '@/theme'

/**
 * El historial de ventas del mostrador.
 *
 * Existe para dos cosas que pasan a diario y que antes no tenían dónde
 * ocurrir: **reenviar un ticket** («no me llegó», «me equivoqué de correo») y
 * **devolver**. Ambas empiezan igual — buscar la venta — así que comparten
 * pantalla en vez de esconderse en dos sitios distintos.
 *
 * Se busca por folio. Es lo que la clienta trae escrito en su correo, y lo que
 * la cajera puede leer en voz alta sin equivocarse.
 */

function cuando(iso: string | null): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Mazatlan',
  }).format(new Date(iso))
}

export default function Historial() {
  const { can } = useSession()
  const { refrescar } = useOrders()
  const [busqueda, setBusqueda] = useState('')
  const [ticket, setTicket] = useState<OrderRow | null>(null)
  const [devolviendo, setDevolviendo] = useState<string | null>(null)

  const { rows, cargando, error, recargar } = useStaffOrders({
    channel: 'pos',
    search: busqueda,
  })

  const puedeDevolver = can('sales.refund')

  return (
    <View style={w.pantalla}>
      <View style={w.cabecera}>
        <Field
          label="Buscar venta"
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Folio de la venta"
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {error ? (
        <View style={w.error}>
          <Text style={s.body}>{error}</Text>
        </View>
      ) : null}

      {cargando ? (
        <View style={[s.fill, s.center]}>
          <ActivityIndicator color={color.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={w.lista}
          ItemSeparatorComponent={() => <View style={s.rule} />}
          ListEmptyComponent={
            <View style={w.vacio}>
              <Text style={s.bodyMuted}>
                {busqueda.trim() !== ''
                  ? 'Ninguna venta con ese folio.'
                  : 'Todavía no hay ventas de mostrador. Aparecerán aquí en cuanto cobres la primera.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={w.fila}>
              <View style={s.fill}>
                <Text style={s.labelStrong}>{item.order_number}</Text>
                <Text style={w.meta}>
                  {`${cuando(item.placed_at)} · ${item.line_count} ${item.line_count === 1 ? 'pieza' : 'piezas'}`}
                </Text>
                {item.payment_status === 'refunded' || item.payment_status === 'partially_refunded' ? (
                  <Text style={w.devuelta}>
                    {item.payment_status === 'refunded' ? 'Devuelta' : 'Devuelta en parte'}
                  </Text>
                ) : null}
              </View>

              <Text style={[s.price, w.importe]}>{formatPrice(item.total_cents, true)}</Text>

              <View style={w.acciones}>
                <Button label="Ticket" variant="subtle" onPress={() => setTicket(item)} />
                {puedeDevolver ? (
                  <Button
                    label="Devolver"
                    variant="outline"
                    onPress={() => setDevolviendo(item.id)}
                  />
                ) : null}
              </View>
            </View>
          )}
        />
      )}

      {/* Se reutiliza la hoja del cierre de venta: reenviar un ticket y mandarlo
          por primera vez son la misma operación, y `pos_send_receipt` no lleva
          client_uuid justamente para que reenviar sea legítimo. El cambio va en
          cero porque aquí ya no se está entregando dinero. */}
      {ticket ? (
        <SaleDoneSheet
          orderId={ticket.id}
          orderNumber={ticket.order_number}
          changeCents={0}
          onClose={() => setTicket(null)}
        />
      ) : null}

      {devolviendo ? (
        <ReturnSheet
          orderId={devolviendo}
          onClose={() => setDevolviendo(null)}
          onHecha={() => {
            void recargar()
            void refrescar()
          }}
        />
      ) : null}
    </View>
  )
}

const w = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.surface },
  cabecera: {
    padding: space.edge,
    borderBottomWidth: 1,
    borderBottomColor: color['surface-variant'],
    backgroundColor: color['paper-bright'],
  },
  lista: { paddingHorizontal: space.edge },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gutter,
    minHeight: size.action,
    paddingVertical: space.gap,
  },
  importe: { minWidth: 110, textAlign: 'right' },
  acciones: { flexDirection: 'row', gap: space.gap },
  meta: { ...text.bodyMd, fontSize: 12, color: color['text-muted'] },
  devuelta: { ...text.labelUpper, fontSize: 10, color: color['text-muted'] },
  vacio: { paddingVertical: space.sectionMd, alignItems: 'center' },
  error: {
    margin: space.edge,
    borderWidth: 1,
    borderColor: color.primary,
    padding: space.gutter,
  },
})
