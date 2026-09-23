import { useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { formatPrice } from '@lumane/core'

import { OrderSheet } from '@/features/orders/OrderSheet'
import { useOrders } from '@/features/orders/OrdersContext'
import { PENDIENTES, etiqueta, type OrderStatus } from '@/features/orders/estados'
import { useStaffOrders, type OrderRow } from '@/features/orders/useStaffOrders'
import { Chip } from '@/ui/Chip'
import { Field } from '@/ui/Field'
import { color, s, size, space, text } from '@/theme'

/**
 * La bandeja de pedidos de la tienda en línea.
 *
 * Se abre sola en «Por atender», que es la pregunta que la encargada tiene
 * cada mañana: qué hay que preparar hoy. Los demás filtros existen para
 * rastrear algo concreto, no para mirarlos a diario.
 *
 * Una fila por pedido, tocable entera: en una tablet, un botón pequeño dentro
 * de una fila es un botón que se falla.
 */

type Filtro = { key: string; label: string; estados: OrderStatus[] | null }

const FILTROS: Filtro[] = [
  { key: 'pendientes', label: 'Por atender', estados: PENDIENTES },
  { key: 'camino', label: 'En camino', estados: ['shipped'] },
  { key: 'entregados', label: 'Entregados', estados: ['delivered', 'completed'] },
  { key: 'cancelados', label: 'Cancelados', estados: ['cancelled'] },
  { key: 'todos', label: 'Todos', estados: null },
]

function cuando(iso: string | null): string {
  if (!iso) return ''
  const fecha = new Date(iso)
  const hoy = new Date()
  const mismoDia =
    fecha.getFullYear() === hoy.getFullYear() &&
    fecha.getMonth() === hoy.getMonth() &&
    fecha.getDate() === hoy.getDate()

  return new Intl.DateTimeFormat('es-MX', {
    ...(mismoDia ? {} : { day: '2-digit', month: 'short' }),
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Mazatlan',
  }).format(fecha)
}

export default function Pedidos() {
  const [filtro, setFiltro] = useState<Filtro>(FILTROS[0]!)
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState<string | null>(null)
  const { refrescar } = useOrders()

  const { rows, cargando, error, recargar } = useStaffOrders({
    channel: 'online',
    status: filtro.estados,
    search: busqueda,
  })

  // El contador del filtro por defecto se calcula de lo que ya está cargado,
  // no con otra consulta: pedir un conteo aparte sería una llamada por cada
  // repintado para un número que solo orienta.
  const pendientes = useMemo(
    () => (filtro.estados === PENDIENTES ? rows.length : undefined),
    [filtro.estados, rows.length],
  )

  return (
    <View style={p.pantalla}>
      <View style={p.cabecera}>
        <Field
          label="Buscar"
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Folio o nombre de la clienta"
          autoCapitalize="none"
          returnKeyType="search"
        />
        <View style={p.filtros}>
          {FILTROS.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              active={f.key === filtro.key}
              count={f.key === filtro.key ? pendientes : undefined}
              onPress={() => setFiltro(f)}
            />
          ))}
        </View>
      </View>

      {error ? (
        <View style={p.error}>
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
          contentContainerStyle={p.lista}
          ItemSeparatorComponent={() => <View style={s.rule} />}
          ListEmptyComponent={
            <View style={p.vacio}>
              <Text style={s.bodyMuted}>
                {busqueda.trim() !== ''
                  ? 'Ningún pedido coincide con esa búsqueda.'
                  : filtro.key === 'pendientes'
                    ? 'No hay pedidos por atender. Todo al día.'
                    : 'Nada aquí todavía.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => <Fila row={item} onPress={() => setAbierto(item.id)} />}
        />
      )}

      {abierto ? (
        <OrderSheet
          orderId={abierto}
          onClose={() => setAbierto(null)}
          onCambio={() => {
            // La lista y el contador del carril, los dos: si solo se recargara
            // la lista, el número del carril seguiría contando un pedido que
            // la encargada acaba de atender hasta el siguiente sondeo.
            void recargar()
            void refrescar()
          }}
        />
      ) : null}
    </View>
  )
}

function Fila({ row, onPress }: { row: OrderRow; onPress: () => void }) {
  const quien =
    [row.customer?.first_name, row.customer?.last_name].filter(Boolean).join(' ') ||
    row.recipient ||
    'Sin nombre'

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Pedido ${row.order_number} de ${quien}, ${etiqueta(row.status)}`}
      style={({ pressed }) => [p.fila, pressed && p.filaPulsada]}
    >
      <View style={p.filaIzq}>
        <Text style={s.labelStrong}>{row.order_number}</Text>
        <Text style={s.body} numberOfLines={1}>
          {quien}
        </Text>
        <Text style={p.meta}>
          {`${cuando(row.placed_at)} · ${row.line_count} ${row.line_count === 1 ? 'pieza' : 'piezas'}`}
          {row.tracking_number ? ` · ${row.tracking_number}` : ''}
        </Text>
      </View>

      <View style={p.filaDer}>
        <Text style={s.price}>{formatPrice(row.total_cents, true)}</Text>
        <Text style={p.estado}>{etiqueta(row.status)}</Text>
      </View>
    </Pressable>
  )
}

const p = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.surface },
  cabecera: {
    padding: space.edge,
    gap: space.gutter,
    borderBottomWidth: 1,
    borderBottomColor: color['surface-variant'],
    backgroundColor: color['paper-bright'],
  },
  filtros: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gap },
  lista: { paddingHorizontal: space.edge },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gutter,
    // Alto cómodo: la fila entera es el área tocable.
    minHeight: size.action,
    paddingVertical: space.gap,
  },
  filaPulsada: { backgroundColor: color['vellum-neutral'] },
  filaIzq: { flex: 1, gap: 2 },
  filaDer: { alignItems: 'flex-end', gap: 2 },
  meta: { ...text.bodyMd, fontSize: 12, color: color['text-muted'] },
  estado: { ...text.labelUpper, fontSize: 10, color: color['text-muted'] },
  vacio: { paddingVertical: space.sectionMd, alignItems: 'center' },
  error: {
    margin: space.edge,
    borderWidth: 1,
    borderColor: color.primary,
    padding: space.gutter,
  },
})
