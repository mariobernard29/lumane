import { useCallback, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { formatPrice, lineTotalCents, type SaleLine } from '@lumane/core'
import { imageUrl } from '@lumane/db'

import { useSaleCart } from '@/features/sale/useSaleCart'
import { useVariantSearch, type VariantHit } from '@/features/sale/useVariantSearch'
import { ChargeSheet } from '@/features/sale/ChargeSheet'
import { SaleDoneSheet } from '@/features/receipt/SaleDoneSheet'
import { useSession, useStaff } from '@/lib/session'
import { supabaseUrl } from '@/lib/supabase'
import { Button } from '@/ui/Button'
import { color, compacto, s, size, space, text } from '@/theme'

/**
 * Ancho mínimo de una tarjeta de la rejilla. Las columnas salen de cuántas
 * caben, no de un número fijo: tres en la tablet de caja, las que quepan en
 * una más chica sin que el nombre de la prenda se parta en cuatro renglones.
 */
const TARJETA_MIN = 160

/**
 * La pantalla de venta. Es la que está abierta el 90 % del día.
 *
 * Dos columnas: catálogo a la izquierda, carrito a la derecha. El objetivo del
 * plan son 15 segundos por venta, y de ahí salen las decisiones:
 *
 *  - El campo de búsqueda tiene el foco al abrir y lo RECUPERA tras cada
 *    añadido. Con pistola de códigos de barras, que no es más que un teclado,
 *    eso convierte la venta en: disparar, disparar, COBRAR.
 *  - Un toque en un resultado lo añade. Sin pantalla intermedia, sin
 *    confirmación: quitar una línea es igual de rápido que ponerla.
 *  - El total se lee desde el otro lado del mostrador.
 */
export default function Venta() {
  const staff = useStaff()
  const { refresh } = useSession()

  const [query, setQuery] = useState('')
  const { results, loading, error, buscarYa } = useVariantSearch(query)
  const carrito = useSaleCart()
  const [cobrando, setCobrando] = useState(false)
  const [columnas, setColumnas] = useState(3)
  /** La venta recién registrada, mientras su hoja de cierre está abierta. */
  const [cobrada, setCobrada] = useState<{
    orderNumber: string
    orderId: string
    changeCents: number
    correo: string | null
  } | null>(null)
  const campo = useRef<TextInput>(null)

  const hayTurno = staff.open_session !== null

  const añadir = useCallback(
    (hit: VariantHit) => {
      carrito.add(hit)
      setQuery('')
      // Devolver el foco es lo que permite encadenar disparos del escáner sin
      // tocar la pantalla entre prenda y prenda.
      campo.current?.focus()
    },
    [carrito],
  )

  /**
   * Enter en el campo.
   *
   * Una pistola de códigos de barras teclea el código y pulsa Enter. Si la
   * búsqueda devuelve exactamente una variante, se añade sola: pedir un toque
   * más anularía la ventaja de tener escáner.
   */
  const alEnviar = useCallback(async () => {
    const texto = query.trim()
    if (texto === '') return

    const hits = await buscarYa(texto)
    if (hits.length === 1) añadir(hits[0]!)
  }, [query, buscarYa, añadir])

  return (
    <View style={v.pantalla}>
      {/* ---------------- Catálogo ---------------- */}
      <View
        style={v.catalogo}
        onLayout={(e) => {
          const util = e.nativeEvent.layout.width - space.gutter * 2
          const caben = Math.floor((util + space.gap) / (TARJETA_MIN + space.gap))
          setColumnas(Math.max(2, Math.min(4, caben)))
        }}
      >
        <View style={v.buscador}>
          <TextInput
            ref={campo}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => void alEnviar()}
            placeholder="Código, SKU, nombre o categoría"
            placeholderTextColor={color['outline-variant']}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            // El teclado no se cierra al enviar: la siguiente prenda viene
            // detrás y reabrirlo cuesta medio segundo cada vez.
            blurOnSubmit={false}
            style={v.campo}
          />
          {loading ? <ActivityIndicator color={color.secondary} /> : null}
        </View>

        {error ? (
          <View style={v.aviso}>
            <Text style={s.body}>No se pudo buscar: {error}</Text>
          </View>
        ) : null}

        <FlatList
          // FlatList no admite cambiar `numColumns` en caliente: la clave
          // nueva lo vuelve a montar con las columnas que caben.
          key={`columnas-${columnas}`}
          data={results}
          keyExtractor={(item) => item.variant_id}
          numColumns={columnas}
          columnWrapperStyle={v.fila}
          contentContainerStyle={v.rejilla}
          keyboardShouldPersistTaps="always"
          ListEmptyComponent={
            loading ? null : (
              <View style={v.vacio}>
                <Text style={s.bodyMuted}>
                  {query.trim() === ''
                    ? 'Escanea una prenda o escribe para buscar.'
                    : `Ninguna variante coincide con «${query.trim()}».`}
                </Text>
              </View>
            )
          }
          renderItem={({ item }) => <TarjetaVariante hit={item} onPress={() => añadir(item)} />}
        />
      </View>

      {/* ---------------- Carrito ---------------- */}
      <View style={v.carrito}>
        <View style={v.carritoCabecera}>
          <Text style={s.labelStrong}>Venta</Text>
          <Text style={s.label}>{carrito.totals.itemCount} pzs</Text>
        </View>

        <FlatList
          data={carrito.lines}
          keyExtractor={(l) => l.variantId}
          contentContainerStyle={v.lineas}
          keyboardShouldPersistTaps="always"
          ListEmptyComponent={
            <View style={v.vacio}>
              <Text style={s.bodyMuted}>Sin piezas todavía.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <LineaCarrito
              linea={item}
              onMas={() => carrito.setQty(item.variantId, item.quantity + 1)}
              onMenos={() => carrito.setQty(item.variantId, item.quantity - 1)}
              onQuitar={() => carrito.remove(item.variantId)}
            />
          )}
        />

        <View style={v.pie}>
          {carrito.totals.discountCents > 0 ? (
            <View style={s.rowBetween}>
              <Text style={s.bodyMuted}>Descuentos</Text>
              <Text style={s.price}>-{formatPrice(carrito.totals.discountCents, true)}</Text>
            </View>
          ) : null}

          <View style={v.totalFila}>
            <Text style={s.label}>Total</Text>
            <Text style={s.priceDisplay} numberOfLines={1} adjustsFontSizeToFit>
              {formatPrice(carrito.totals.totalCents, true)}
            </Text>
          </View>

          {!hayTurno ? (
            // No se esconde el botón de cobrar: se explica por qué no se puede
            // y se ofrece el arreglo. `pos_create_sale` rechazaría la venta de
            // todas formas, y descubrirlo al pulsar COBRAR es tarde.
            <View style={v.avisoTurno}>
              <Text style={s.body}>No hay caja abierta. Ábrela antes de cobrar.</Text>
            </View>
          ) : null}

          <Button
            label="Cobrar"
            size="charge"
            fullWidth
            trailing={formatPrice(carrito.totals.totalCents, true)}
            disabled={carrito.isEmpty || !hayTurno}
            onPress={() => setCobrando(true)}
          />
        </View>
      </View>

      {cobrando ? (
        <ChargeSheet
          carrito={carrito}
          onCancelar={() => setCobrando(false)}
          onCobrada={(orderNumber, orderId, changeCents) => {
            setCobrando(false)
            // Se lee ANTES del reset, que borra la clienta del carrito.
            const correo = carrito.customer?.email ?? null
            // El carrito se vacía AQUÍ, no al cerrar la hoja siguiente: la
            // venta ya está registrada y cobrada, así que dejarla en pantalla
            // invitaría a cobrarla otra vez. `reset()` estrena client_uuid.
            carrito.reset()
            setQuery('')
            // El turno cambia de saldo con cada venta en efectivo; releerlo
            // mantiene sincronizado lo que el módulo de caja va a mostrar.
            void refresh()
            setCobrada({ orderNumber, orderId, changeCents, correo })
          }}
        />
      ) : null}

      {cobrada ? (
        <SaleDoneSheet
          orderId={cobrada.orderId}
          orderNumber={cobrada.orderNumber}
          changeCents={cobrada.changeCents}
          correoSugerido={cobrada.correo}
          onClose={() => {
            setCobrada(null)
            // El foco vuelve al buscador al cerrar, no antes: es lo que permite
            // encadenar la siguiente venta con el escáner sin tocar la pantalla.
            campo.current?.focus()
          }}
        />
      ) : null}
    </View>
  )
}

function TarjetaVariante({ hit, onPress }: { hit: VariantHit; onPress: () => void }) {
  const agotada = hit.available <= 0

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${hit.product_name} talla ${hit.variant_title || 'única'}, ${hit.available} disponibles`}
      style={({ pressed }) => [v.tarjeta, pressed && v.tarjetaPulsada]}
    >
      {/* La foto se busca con los ojos antes que el nombre: una boutique
          reconoce sus prendas por la prenda. Va a sangre y con altura FIJA,
          no con proporción: una altura relativa al ancho de la columna haría
          tarjetas enormes en horizontal y dejaría dos filas a la vista. Con
          96 caben cuatro y la prenda sigue siendo reconocible. */}
      <View style={v.foto}>
        {hit.image_path ? (
          <Image
            source={{ uri: imageUrl(supabaseUrl, hit.image_path) }}
            style={v.fotoImagen}
            resizeMode="cover"
          />
        ) : (
          <Text style={v.sinFoto}>Sin foto</Text>
        )}
      </View>

      <View style={v.tarjetaCuerpo}>
        <Text style={v.tarjetaNombre} numberOfLines={2}>
          {hit.product_name}
        </Text>
        <View style={v.tarjetaMedio}>
          <Text style={s.labelStrong}>{hit.variant_title || 'Única'}</Text>
          {/* El stock se muestra SIEMPRE, también en cero: la cajera puede
              vender la prenda que tiene en la mano aunque el sistema no la
              cuente, y necesita saber que va a quedar en descuadre. */}
          <Text style={[s.label, agotada && v.agotada]}>{hit.available} disp</Text>
        </View>
        <Text style={s.price}>{formatPrice(hit.price_cents)}</Text>
        <Text style={v.sku} numberOfLines={1}>
          {hit.sku}
        </Text>
      </View>
    </Pressable>
  )
}

function LineaCarrito({
  linea,
  onMas,
  onMenos,
  onQuitar,
}: {
  linea: SaleLine
  onMas: () => void
  onMenos: () => void
  onQuitar: () => void
}) {
  const excede = linea.quantity > linea.available

  const pasos = (
    <View style={v.pasos}>
      <Pressable onPress={onMenos} style={v.paso} accessibilityLabel="Quitar una">
        <Text style={v.pasoTexto}>−</Text>
      </Pressable>
      <Text style={v.cantidad}>{linea.quantity}</Text>
      <Pressable onPress={onMas} style={v.paso} accessibilityLabel="Añadir una">
        <Text style={v.pasoTexto}>+</Text>
      </Pressable>
    </View>
  )

  // En compacto el carril del carrito mide 320: en una sola fila, nombre,
  // botones e importe dejarían 80 dp para el nombre. En dos renglones el
  // nombre usa todo el ancho y los controles van debajo.
  if (compacto) {
    return (
      <View style={v.lineaCompacta}>
        <View style={v.lineaArriba}>
          <Text style={[s.body, s.fill]} numberOfLines={2}>
            {linea.productName}
          </Text>
          <Text style={s.price}>{formatPrice(lineTotalCents(linea), true)}</Text>
        </View>
        <Text style={s.label}>
          {linea.variantTitle || 'Única'} · {formatPrice(linea.unitPriceCents)}
        </Text>
        {excede ? <Text style={v.excede}>Solo hay {linea.available} en sistema</Text> : null}
        <View style={v.lineaAbajo}>
          {pasos}
          <Pressable onPress={onQuitar} accessibilityLabel="Quitar del carrito" style={v.quitarToque}>
            <Text style={v.quitar}>Quitar</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <View style={v.linea}>
      <View style={s.fill}>
        <Text style={s.body} numberOfLines={2}>
          {linea.productName}
        </Text>
        <Text style={s.label}>
          {linea.variantTitle || 'Única'} · {formatPrice(linea.unitPriceCents)}
        </Text>
        {excede ? (
          <Text style={v.excede}>Solo hay {linea.available} en sistema</Text>
        ) : null}
      </View>

      {pasos}

      <View style={v.importe}>
        <Text style={s.price}>{formatPrice(lineTotalCents(linea), true)}</Text>
        <Pressable onPress={onQuitar} accessibilityLabel="Quitar del carrito">
          <Text style={v.quitar}>Quitar</Text>
        </Pressable>
      </View>
    </View>
  )
}

const v = StyleSheet.create({
  pantalla: { flex: 1, flexDirection: 'row' },

  catalogo: { flex: 3, padding: space.gutter },
  buscador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gap,
    borderBottomWidth: size.border,
    borderBottomColor: color.primary,
    marginBottom: space.gutter,
  },
  campo: { ...text.headlineSm, color: color.primary, flex: 1, paddingVertical: 14 },
  aviso: {
    borderWidth: 1,
    borderColor: color.primary,
    padding: space.gap,
    marginBottom: space.gap,
  },
  rejilla: { gap: space.gap, paddingBottom: space.sectionMd },
  fila: { gap: space.gap },
  vacio: { padding: space.sectionSm, alignItems: 'center' },

  tarjeta: {
    flex: 1,
    minHeight: compacto ? 112 : 132,
    backgroundColor: color['paper-bright'],
    borderWidth: 1,
    borderColor: color['surface-variant'],
    // Sin relleno: lo pone el cuerpo. La foto tiene que llegar al borde, y un
    // relleno en la tarjeta la dejaría flotando dentro de un marco.
    overflow: 'hidden',
  },
  foto: {
    height: compacto ? 72 : 96,
    backgroundColor: color['vellum-neutral'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  fotoImagen: { width: '100%', height: '100%' },
  sinFoto: { ...text.labelUpper, fontSize: 10, letterSpacing: 1, color: color['text-muted'] },
  tarjetaCuerpo: { flex: 1, padding: space.gap, justifyContent: 'space-between' },
  tarjetaPulsada: { backgroundColor: color['vellum-neutral'], borderColor: color.primary },
  tarjetaNombre: { ...text.bodyMd, fontSize: 15, lineHeight: 20, color: color.primary },
  tarjetaMedio: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  agotada: { textDecorationLine: 'line-through', color: color.outline },
  sku: { ...text.labelUpper, fontSize: 10, letterSpacing: 1, color: color['text-muted'] },

  // En compacto, ancho fijo: con `flex: 2` el carrito se quedaba en 330 dp y la
  // rejilla en 500; fijo en 320 el reparto es el mismo pero no depende del
  // ancho del carril.
  carrito: {
    ...(compacto ? { width: 320 } : { flex: 2 }),
    backgroundColor: color['paper-bright'],
    borderLeftWidth: 1,
    borderLeftColor: color.primary,
  },
  carritoCabecera: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: space.gutter,
    borderBottomWidth: 1,
    borderBottomColor: color.primary,
  },
  lineas: { paddingHorizontal: space.gutter },
  linea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gap,
    paddingVertical: space.gap,
    borderBottomWidth: 1,
    borderBottomColor: color['surface-variant'],
  },
  excede: { ...text.labelUpper, color: color.primary, marginTop: 4 },
  lineaCompacta: {
    gap: 4,
    paddingVertical: space.gap,
    borderBottomWidth: 1,
    borderBottomColor: color['surface-variant'],
  },
  lineaArriba: { flexDirection: 'row', alignItems: 'flex-start', gap: space.gap },
  lineaAbajo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  quitarToque: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.gap },

  pasos: { flexDirection: 'row', alignItems: 'center' },
  paso: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color['surface-variant'],
  },
  pasoTexto: { ...text.bodyLg, color: color.primary },
  cantidad: { ...text.bodyMd, color: color.primary, width: 40, textAlign: 'center' },

  importe: { alignItems: 'flex-end', minWidth: 96, gap: 4 },
  quitar: { ...text.labelUpper, fontSize: 10, color: color['text-muted'] },

  pie: {
    padding: space.gutter,
    gap: space.gap,
    borderTopWidth: 1,
    borderTopColor: color.primary,
  },
  totalFila: { gap: 2 },
  avisoTurno: { borderWidth: 1, borderColor: color.primary, padding: space.gap },
})
