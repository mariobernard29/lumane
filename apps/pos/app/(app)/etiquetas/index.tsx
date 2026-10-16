import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { formatPrice } from '@lumane/core'
import { errorMessage } from '@lumane/db'

import { cargarImpresora, hayEtiquetadora, useImpresora } from '@/features/printer/impresora'
import {
  agregarEtiquetas,
  aDatos,
  ajustesDe,
  fijarCopias,
  formatoDe,
  imprimirEtiquetas,
  nombreFormato,
  useListaEtiquetas,
  vaciarEtiquetas,
  type ItemEtiqueta,
} from '@/features/printer/etiquetas'
import { VistaEtiqueta } from '@/features/printer/VistaEtiqueta'
import { useVariantSearch, type VariantHit } from '@/features/sale/useVariantSearch'
import { Button } from '@/ui/Button'
import { color, compacto, s, size, space, text, useVertical } from '@/theme'

/**
 * Etiquetas para las prendas.
 *
 * Igual que Venta, pero lo que se junta no se cobra: se imprime. Se busca o se
 * escanea la prenda, cada toque suma una etiqueta, y «Imprimir» las manda
 * todas a la etiquetadora. Desde la ficha de una prenda se pueden traer de una
 * vez todas sus tallas con tantas copias como piezas haya.
 */
export default function Etiquetas() {
  const router = useRouter()
  const vertical = useVertical()
  const { prefs, estado } = useImpresora()
  const lista = useListaEtiquetas()
  const [query, setQuery] = useState('')
  const { results, loading, error, buscarYa } = useVariantSearch(query)
  const [imprimiendo, setImprimiendo] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)
  const [elegida, setElegida] = useState<string | null>(null)
  const [anchoVista, setAnchoVista] = useState(280)
  const campo = useRef<TextInput>(null)

  useEffect(() => {
    void cargarImpresora()
  }, [])
  const etiquetadora = prefs.etiquetadora
  const total = lista.reduce((n, i) => n + i.copias, 0)

  const añadir = useCallback((hit: VariantHit) => {
    agregarEtiquetas([deHit(hit)])
    setElegida(hit.variant_id)
    setQuery('')
    setAviso(null)
    campo.current?.focus()
  }, [])

  // El escáner teclea el código y Enter: si es una sola prenda, entra sola.
  async function alEnviar() {
    const texto = query.trim()
    if (!texto) return
    const hits = await buscarYa(texto)
    const exacta = hits.find((h) => h.barcode === texto || h.sku.toUpperCase() === texto.toUpperCase())
    if (exacta) añadir(exacta)
    else if (hits.length === 1) añadir(hits[0]!)
  }

  async function imprimir() {
    setImprimiendo(true)
    setFallo(null)
    setAviso(null)
    try {
      const avisos = await imprimirEtiquetas(lista)
      setAviso(
        [
          `${total} ${total === 1 ? 'etiqueta mandada' : 'etiquetas mandadas'} a ${etiquetadora.nombre ?? 'la etiquetadora'}.`,
          ...avisos,
        ].join('\n'),
      )
      vaciarEtiquetas()
    } catch (e) {
      setFallo(errorMessage(e as { message?: string }))
    } finally {
      setImprimiendo(false)
    }
  }

  const muestra = lista.find((i) => i.variantId === elegida) ?? lista[lista.length - 1] ?? null
  const datosMuestra = useMemo(() => (muestra ? aDatos([muestra])[0]! : null), [muestra])
  const formato = useMemo(() => formatoDe(etiquetadora), [etiquetadora])
  const ajustes = useMemo(() => ajustesDe(etiquetadora), [etiquetadora])

  return (
    <View style={[k.pantalla, vertical && k.pantallaVertical]}>
      {/* ---------------- Buscar ---------------- */}
      <View style={[k.buscar, vertical && k.buscarVertical]}>
        <View style={k.buscador}>
          <TextInput
            ref={campo}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => void alEnviar()}
            placeholder="Escanea o busca la prenda"
            placeholderTextColor={color['outline-variant']}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            blurOnSubmit={false}
            style={k.campo}
          />
          {loading ? <ActivityIndicator color={color.secondary} /> : null}
        </View>
        {error ? <Text style={[s.body, k.fallo]}>No se pudo buscar: {error}</Text> : null}

        <FlatList
          data={results}
          keyExtractor={(h) => h.variant_id}
          keyboardShouldPersistTaps="always"
          ListEmptyComponent={
            loading ? null : (
              <Text style={[s.bodyMuted, k.vacio]}>
                {query.trim()
                  ? `Nada coincide con «${query.trim()}».`
                  : 'Escribe el nombre, el SKU o escanea el código.'}
              </Text>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => añadir(item)}
              accessibilityRole="button"
              accessibilityLabel={`Añadir etiqueta de ${item.product_name} ${item.variant_title}`}
              style={({ pressed }) => [k.resultado, pressed && k.pulsado]}
            >
              <View style={s.fill}>
                <Text style={s.body} numberOfLines={1}>
                  {item.product_name}
                </Text>
                <Text style={s.label} numberOfLines={1}>
                  {(item.variant_title || 'Única') + ' · ' + item.sku}
                </Text>
              </View>
              <Text style={s.price}>{formatPrice(item.price_cents)}</Text>
              <Text style={[s.labelStrong, k.mas]}>+1</Text>
            </Pressable>
          )}
        />
      </View>

      {/* ---------------- Lista e impresión ---------------- */}
      <View style={[k.lista, vertical && k.listaVertical]}>
        <View style={k.cabecera}>
          <Text style={s.labelStrong}>Por imprimir</Text>
          <Text style={s.label}>{total} etiquetas</Text>
        </View>

        <ScrollView contentContainerStyle={k.lineas} keyboardShouldPersistTaps="always">
          {lista.length === 0 ? (
            <Text style={[s.bodyMuted, k.vacio]}>
              Toca una prenda para añadir su etiqueta. Desde Productos puedes traer todas las tallas de una
              prenda.
            </Text>
          ) : null}
          {lista.map((item) => (
            <Linea
              key={item.variantId}
              item={item}
              elegida={item.variantId === muestra?.variantId}
              onElegir={() => setElegida(item.variantId)}
            />
          ))}

          {datosMuestra ? (
            <View style={k.vista} onLayout={(e) => setAnchoVista(Math.min(360, e.nativeEvent.layout.width))}>
              <Text style={[s.label, k.vistaTitulo]}>Vista previa · {nombreFormato(etiquetadora)}</Text>
              <VistaEtiqueta datos={datosMuestra} formato={formato} ajustes={ajustes} ancho={anchoVista} />
            </View>
          ) : null}
        </ScrollView>

        <View style={k.pie}>
          {fallo ? <Text style={[s.body, k.fallo]}>{fallo}</Text> : null}
          {aviso ? <Text style={s.bodyMuted}>{aviso}</Text> : null}
          {!hayEtiquetadora() ? (
            <View style={k.sinImpresora}>
              <Text style={s.body}>Falta elegir la etiquetadora.</Text>
              <Button
                label="Configurar"
                variant="outline"
                onPress={() =>
                  router.replace({
                    pathname: '/impresora',
                    params: { rol: 'etiquetas' },
                  })
                }
              />
            </View>
          ) : null}
          <View style={k.botones}>
            <View style={s.fill}>
              <Button
                label="Vaciar"
                variant="subtle"
                fullWidth
                disabled={lista.length === 0 || imprimiendo}
                onPress={() => {
                  vaciarEtiquetas()
                  setAviso(null)
                }}
              />
            </View>
            <View style={k.imprimir}>
              <Button
                label={imprimiendo ? 'Imprimiendo…' : `Imprimir ${total || ''}`.trim()}
                size="lg"
                fullWidth
                loading={imprimiendo || estado === 'imprimiendo'}
                disabled={total === 0 || !hayEtiquetadora()}
                onPress={() => void imprimir()}
              />
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}

function deHit(h: VariantHit): ItemEtiqueta {
  return {
    variantId: h.variant_id,
    nombre: h.product_name,
    detalle: h.variant_title === 'Única' ? '' : h.variant_title,
    sku: h.sku,
    precioCents: h.price_cents,
    copias: 1,
  }
}

function Linea({ item, elegida, onElegir }: { item: ItemEtiqueta; elegida: boolean; onElegir: () => void }) {
  return (
    <Pressable onPress={onElegir} style={[k.linea, elegida && k.lineaElegida]} accessibilityRole="button">
      <View style={s.fill}>
        <Text style={s.body} numberOfLines={1}>
          {item.nombre}
        </Text>
        <Text style={s.label} numberOfLines={1}>
          {[item.detalle || 'Única', item.sku, formatPrice(item.precioCents)].join(' · ')}
        </Text>
      </View>
      <View style={k.pasos}>
        <Pressable
          onPress={() => fijarCopias(item.variantId, item.copias - 1)}
          style={k.paso}
          accessibilityLabel="Una etiqueta menos"
        >
          <Text style={k.pasoTexto}>−</Text>
        </Pressable>
        <Text style={k.cantidad}>{item.copias}</Text>
        <Pressable
          onPress={() => fijarCopias(item.variantId, item.copias + 1)}
          style={k.paso}
          accessibilityLabel="Una etiqueta más"
        >
          <Text style={k.pasoTexto}>+</Text>
        </Pressable>
      </View>
    </Pressable>
  )
}

const k = StyleSheet.create({
  pantalla: { flex: 1, flexDirection: 'row' },
  pantallaVertical: { flexDirection: 'column' },

  buscar: { flex: 3, padding: space.gutter },
  buscarVertical: { flex: 2 },
  buscador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gap,
    borderBottomWidth: size.border,
    borderBottomColor: color.primary,
    marginBottom: space.gap,
  },
  campo: {
    ...text.headlineSm,
    color: color.primary,
    flex: 1,
    paddingVertical: 14,
  },
  resultado: {
    minHeight: size.touchMin,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gap,
    paddingVertical: 8,
    paddingHorizontal: space.gap,
    borderBottomWidth: 1,
    borderBottomColor: color['surface-variant'],
  },
  pulsado: { backgroundColor: color['vellum-neutral'] },
  mas: { minWidth: 32, textAlign: 'right' },
  vacio: { padding: space.gutter, textAlign: 'center' },
  fallo: { marginBottom: space.gap },

  lista: {
    ...(compacto ? { width: 340 } : { flex: 2 }),
    backgroundColor: color['paper-bright'],
    borderLeftWidth: 1,
    borderLeftColor: color.primary,
  },
  listaVertical: {
    width: '100%',
    flex: 3,
    borderLeftWidth: 0,
    borderTopWidth: 1,
    borderTopColor: color.primary,
  },
  cabecera: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: space.gutter,
    borderBottomWidth: 1,
    borderBottomColor: color.primary,
  },
  lineas: { paddingHorizontal: space.gutter, paddingBottom: space.gutter },
  linea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gap,
    paddingVertical: space.gap,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: color['surface-variant'],
  },
  lineaElegida: { backgroundColor: color['vellum-neutral'] },
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
  cantidad: {
    ...text.bodyMd,
    color: color.primary,
    width: 40,
    textAlign: 'center',
  },
  vista: { marginTop: space.gutter, alignItems: 'flex-start' },
  vistaTitulo: { marginBottom: space.gap },
  pie: {
    padding: space.gutter,
    gap: space.gap,
    borderTopWidth: 1,
    borderTopColor: color.primary,
  },
  sinImpresora: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.gap,
  },
  botones: { flexDirection: 'row', gap: space.gap },
  imprimir: { flex: 2 },
})
