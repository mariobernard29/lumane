import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { imageUrl } from '@lumane/db'

import { CategoriaSheet } from '@/features/products/CategoriaSheet'
import {
  listarCategorias,
  listarProductos,
  type Categoria,
  type FilaProducto,
} from '@/features/products/datos'
import { supabaseUrl } from '@/lib/supabase'
import { Button } from '@/ui/Button'
import { Chip } from '@/ui/Chip'
import { Field } from '@/ui/Field'
import { color, s, size, space, text } from '@/theme'

/**
 * El catálogo desde la caja: prendas y categorías.
 *
 * Una prenda se da de alta aquí con sus tallas y colores, sus cuidados y sus
 * fotos, y puede quedarse solo para la boutique. La lista enseña también lo
 * archivado y los borradores: aquí se viene a arreglar, no a vender.
 */

type Pestaña = 'prendas' | 'categorias'

const ESTADO: Record<FilaProducto['status'], string | null> = {
  active: null,
  draft: 'Borrador',
  archived: 'Archivada',
}

const ESPERA_MS = 220

export default function Productos() {
  const router = useRouter()
  const [pestaña, setPestaña] = useState<Pestaña>('prendas')
  const [busqueda, setBusqueda] = useState('')
  const [productos, setProductos] = useState<FilaProducto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState<Categoria | 'nueva' | null>(null)
  const turno = useRef(0)

  const cargarProductos = useCallback(async () => {
    const miTurno = ++turno.current
    try {
      const filas = await listarProductos(busqueda)
      if (miTurno !== turno.current) return
      setProductos(filas)
      setError(null)
    } catch (e) {
      if (miTurno === turno.current) setError((e as Error).message)
    } finally {
      if (miTurno === turno.current) setCargando(false)
    }
  }, [busqueda])

  const cargarCategorias = useCallback(async () => {
    try {
      setCategorias(await listarCategorias())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void cargarProductos(), ESPERA_MS)
    return () => clearTimeout(t)
  }, [cargarProductos])

  // Al volver de la ficha, la lista refleja lo que se acaba de guardar.
  useFocusEffect(
    useCallback(() => {
      void cargarProductos()
      void cargarCategorias()
    }, [cargarProductos, cargarCategorias]),
  )

  return (
    <View style={k.pantalla}>
      <View style={k.cabecera}>
        <View style={k.filaCabecera}>
          <View style={k.pestañas}>
            <Chip label="Prendas" active={pestaña === 'prendas'} onPress={() => setPestaña('prendas')} />
            <Chip
              label="Categorías"
              active={pestaña === 'categorias'}
              count={categorias.length}
              onPress={() => setPestaña('categorias')}
            />
          </View>
          {pestaña === 'prendas' ? (
            <Button label="Nueva prenda" onPress={() => router.push('/productos/nueva')} />
          ) : (
            <Button label="Nueva categoría" onPress={() => setEditando('nueva')} />
          )}
        </View>

        {pestaña === 'prendas' ? (
          <Field
            label="Buscar"
            value={busqueda}
            onChangeText={setBusqueda}
            placeholder="Nombre o código"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        ) : null}
      </View>

      {error ? (
        <View style={k.error}>
          <Text style={s.body}>{error}</Text>
        </View>
      ) : null}

      {pestaña === 'prendas' ? (
        cargando ? (
          <View style={[s.fill, s.center]}>
            <ActivityIndicator color={color.primary} size="large" />
          </View>
        ) : (
          <FlatList
            data={productos}
            keyExtractor={(p) => p.id}
            contentContainerStyle={k.lista}
            ItemSeparatorComponent={() => <View style={s.rule} />}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={k.vacio}>
                <Text style={s.bodyMuted}>
                  {busqueda.trim() !== ''
                    ? 'Ninguna prenda coincide con esa búsqueda.'
                    : 'Todavía no hay prendas. Empieza con «Nueva prenda».'}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <FilaPrenda
                p={item}
                onPress={() => router.push({ pathname: '/productos/[id]', params: { id: item.id } })}
              />
            )}
          />
        )
      ) : (
        <FlatList
          data={ordenarCategorias(categorias)}
          keyExtractor={(c) => c.id}
          contentContainerStyle={k.lista}
          ItemSeparatorComponent={() => <View style={s.rule} />}
          ListEmptyComponent={
            <View style={k.vacio}>
              <Text style={s.bodyMuted}>No hay categorías todavía.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setEditando(item)}
              accessibilityRole="button"
              style={({ pressed }) => [k.fila, pressed && k.filaPulsada]}
            >
              <View style={s.fill}>
                <Text style={s.body}>
                  {item.parentId ? '    ' : ''}
                  {item.name}
                </Text>
                <Text style={k.meta}>
                  {[
                    `${item.productos} ${item.productos === 1 ? 'prenda' : 'prendas'}`,
                    item.isVisible ? null : 'oculta en la tienda',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <Text style={s.label}>Editar</Text>
            </Pressable>
          )}
        />
      )}

      {editando ? (
        <CategoriaSheet
          categoria={editando === 'nueva' ? null : editando}
          categorias={categorias}
          onClose={() => setEditando(null)}
          onHecho={() => {
            setEditando(null)
            void cargarCategorias()
            void cargarProductos()
          }}
        />
      ) : null}
    </View>
  )
}

/** Madres primero y cada hija debajo de la suya. */
function ordenarCategorias(lista: Categoria[]): Categoria[] {
  const madres = lista.filter((c) => !c.parentId || !lista.some((m) => m.id === c.parentId))
  return madres.flatMap((m) => [m, ...lista.filter((h) => h.parentId === m.id)])
}

function FilaPrenda({ p, onPress }: { p: FilaProducto; onPress: () => void }) {
  const estado = ESTADO[p.status]
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${p.name}${estado ? `, ${estado}` : ''}`}
      style={({ pressed }) => [k.fila, pressed && k.filaPulsada]}
    >
      {p.foto ? (
        <Image source={{ uri: imageUrl(supabaseUrl, p.foto) }} style={k.foto} />
      ) : (
        <View style={[k.foto, k.sinFoto]}>
          <Text style={k.sinFotoTexto}>Sin foto</Text>
        </View>
      )}

      <View style={s.fill}>
        <Text style={s.body} numberOfLines={1}>
          {p.name}
        </Text>
        <Text style={k.meta} numberOfLines={1}>
          {[
            p.code,
            p.categoria ?? 'Sin categoría',
            `${p.variantes} ${p.variantes === 1 ? 'variante' : 'variantes'}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>

      <View style={k.etiquetas}>
        {estado ? <Text style={k.etiqueta}>{estado}</Text> : null}
        {!p.isOnline ? <Text style={k.etiqueta}>Solo boutique</Text> : null}
      </View>
    </Pressable>
  )
}

const k = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.surface },
  cabecera: {
    padding: space.edge,
    gap: space.gutter,
    borderBottomWidth: 1,
    borderBottomColor: color['surface-variant'],
    backgroundColor: color['paper-bright'],
  },
  filaCabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.gap },
  pestañas: { flexDirection: 'row', gap: space.gap },
  lista: { paddingHorizontal: space.edge, paddingBottom: space.sectionMd },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gutter,
    minHeight: size.touchMin,
    paddingVertical: space.gap,
  },
  filaPulsada: { backgroundColor: color['vellum-neutral'] },
  foto: { width: 52, height: 64, backgroundColor: color['surface-container'] },
  sinFoto: { alignItems: 'center', justifyContent: 'center' },
  sinFotoTexto: { ...text.labelUpper, fontSize: 8, color: color['text-muted'], textAlign: 'center' },
  meta: { ...text.bodyMd, fontSize: 12, color: color['text-muted'] },
  etiquetas: { alignItems: 'flex-end', gap: 4 },
  etiqueta: {
    ...text.labelUpper,
    fontSize: 10,
    color: color.primary,
    borderWidth: 1,
    borderColor: color.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  vacio: { paddingVertical: space.sectionMd, alignItems: 'center' },
  error: { margin: space.edge, borderWidth: 1, borderColor: color.primary, padding: space.gutter },
})
