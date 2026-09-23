import { useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { formatPrice } from '@lumane/core'

import { MovimientoSheet } from '@/features/inventory/MovimientoSheet'
import { useInventory, type FilaInventario } from '@/features/inventory/useInventory'
import { Chip } from '@/ui/Chip'
import { Field } from '@/ui/Field'
import { color, s, size, space, text } from '@/theme'

/**
 * El inventario de la sucursal.
 *
 * Abre en «Por reponer», que es la pregunta de la mañana: qué hay que pedir.
 * «Todo» está a un toque para cuando se busca una prenda concreta.
 *
 * Muestra también lo archivado y lo agotado, al revés que la búsqueda de
 * venta: aquí se viene justamente a arreglar lo que no está bien, y esconderlo
 * haría invisible el problema.
 */
export default function Inventario() {
  const [busqueda, setBusqueda] = useState('')
  const [soloBajoMinimo, setSoloBajoMinimo] = useState(true)
  const [abierta, setAbierta] = useState<FilaInventario | null>(null)

  const { filas, total, cargando, error, recargar } = useInventory(busqueda, soloBajoMinimo)

  return (
    <View style={i.pantalla}>
      <View style={i.cabecera}>
        <Field
          label="Buscar"
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Nombre, SKU o código de barras"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        <View style={i.filtros}>
          <Chip
            label="Por reponer"
            active={soloBajoMinimo}
            onPress={() => setSoloBajoMinimo(true)}
          />
          <Chip label="Todo" active={!soloBajoMinimo} onPress={() => setSoloBajoMinimo(false)} />
          {!cargando ? (
            <Text style={i.conteo}>
              {filas.length === total
                ? `${total} ${total === 1 ? 'variante' : 'variantes'}`
                : `${filas.length} de ${total}`}
            </Text>
          ) : null}
        </View>
      </View>

      {error ? (
        <View style={i.error}>
          <Text style={s.body}>{error}</Text>
        </View>
      ) : null}

      {cargando ? (
        <View style={[s.fill, s.center]}>
          <ActivityIndicator color={color.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filas}
          keyExtractor={(f) => f.variant_id}
          contentContainerStyle={i.lista}
          ItemSeparatorComponent={() => <View style={s.rule} />}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={i.vacio}>
              <Text style={s.bodyMuted}>
                {busqueda.trim() !== ''
                  ? 'Ninguna pieza coincide con esa búsqueda.'
                  : soloBajoMinimo
                    ? 'Nada por reponer. El inventario está al día.'
                    : 'Todavía no hay prendas dadas de alta.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => <Fila fila={item} onPress={() => setAbierta(item)} />}
        />
      )}

      {abierta ? (
        <MovimientoSheet
          fila={abierta}
          onClose={() => setAbierta(null)}
          onHecho={() => void recargar()}
        />
      ) : null}
    </View>
  )
}

function Fila({ fila, onPress }: { fila: FilaInventario; onPress: () => void }) {
  const agotada = fila.available <= 0
  const baja = !agotada && fila.available <= fila.low_stock_threshold

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${fila.product_name}, talla ${fila.variant_title}, ${fila.available} disponibles`}
      style={({ pressed }) => [i.fila, pressed && i.filaPulsada]}
    >
      <View style={s.fill}>
        <Text style={s.body} numberOfLines={1}>
          {fila.product_name}
          <Text style={s.bodyMuted}>{` · ${fila.variant_title}`}</Text>
        </Text>
        <Text style={i.meta}>
          {fila.sku}
          {fila.product_status !== 'active' ? ' · no publicada' : ''}
          {!fila.is_active ? ' · variante apagada' : ''}
          {fila.reserved > 0 ? ` · ${fila.reserved} apartada${fila.reserved === 1 ? '' : 's'}` : ''}
        </Text>
      </View>

      <Text style={i.precio}>{formatPrice(fila.price_cents)}</Text>

      {/* El número que importa es el DISPONIBLE, no el físico: es el que la
          tienda en línea puede vender. Las apartadas se dicen abajo, en letra
          pequeña, porque explican una diferencia que si no desconcierta. */}
      <View style={i.existencias}>
        <Text style={agotada || baja ? s.labelStrong : s.body}>{fila.available}</Text>
        {agotada ? (
          <Text style={i.aviso}>Agotada</Text>
        ) : baja ? (
          <Text style={i.aviso}>Últimas</Text>
        ) : null}
      </View>
    </Pressable>
  )
}

const i = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.surface },
  cabecera: {
    padding: space.edge,
    gap: space.gutter,
    borderBottomWidth: 1,
    borderBottomColor: color['surface-variant'],
    backgroundColor: color['paper-bright'],
  },
  filtros: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.gap },
  conteo: { ...text.labelUpper, fontSize: 11, color: color['text-muted'], marginLeft: 'auto' },
  lista: { paddingHorizontal: space.edge },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gutter,
    minHeight: size.touchMin,
    paddingVertical: space.gap,
  },
  filaPulsada: { backgroundColor: color['vellum-neutral'] },
  meta: { ...text.bodyMd, fontSize: 12, color: color['text-muted'] },
  precio: { ...text.price, color: color.secondary, minWidth: 96, textAlign: 'right' },
  existencias: { minWidth: 72, alignItems: 'flex-end' },
  aviso: { ...text.labelUpper, fontSize: 9, color: color['text-muted'] },
  vacio: { paddingVertical: space.sectionMd, alignItems: 'center' },
  error: {
    margin: space.edge,
    borderWidth: 1,
    borderColor: color.primary,
    padding: space.gutter,
  },
})
