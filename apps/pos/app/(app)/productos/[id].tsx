import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  formatAmount,
  normalizarCodigo,
  parseAmountToCents,
  planearVariantes,
  skusRepetidos,
  type VarianteEditable,
} from '@lumane/core'

import {
  borrarProducto,
  cargarProducto,
  guardarProducto,
  listarCategorias,
  productoVacio,
  type Categoria,
  type EstadoProducto,
  type ProductoCompleto,
} from '@/features/products/datos'
import { FotosEditor } from '@/features/products/FotosEditor'
import { OpcionesEditor } from '@/features/products/OpcionesEditor'
import { Button } from '@/ui/Button'
import { Chip } from '@/ui/Chip'
import { Field } from '@/ui/Field'
import { color, s, size, space, text } from '@/theme'

/**
 * La ficha de una prenda: alta y edición.
 *
 * A la izquierda lo que la describe (nombre, código, categoría, composición,
 * cuidados, fotos); a la derecha lo que se vende (precio, opciones,
 * variantes). Las variantes no se teclean una por una: salen de combinar las
 * opciones, cada una con su código (`1234-CH-NEG`).
 *
 * Las existencias NO se cargan aquí: las variantes nacen con 0 y se reciben en
 * Inventario, que deja el movimiento con motivo y autor.
 */

const ESTADOS: { key: EstadoProducto; label: string }[] = [
  { key: 'active', label: 'Activa' },
  { key: 'draft', label: 'Borrador' },
  { key: 'archived', label: 'Archivada' },
]

const MATERIALES = ['Algodón', 'Poliéster', 'Lino', 'Viscosa', 'Seda', 'Elastano', 'Lana', 'Piel']
const CUIDADOS = [
  'Lavar a mano con agua fría',
  'Lavar en ciclo delicado',
  'No usar blanqueador',
  'No usar secadora',
  'Planchar a temperatura baja',
  'Secar a la sombra',
  'Lavado en seco',
]

export default function FichaProducto() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const esNueva = id === 'nueva'

  const [p, setP] = useState<ProductoCompleto | null>(esNueva ? productoVacio() : null)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [precio, setPrecio] = useState('')
  const [anterior, setAnterior] = useState('')
  const [regenerar, setRegenerar] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    void listarCategorias()
      .then(setCategorias)
      .catch(() => undefined)
    if (esNueva) return
    void cargarProducto(id)
      .then((cargado) => {
        setP(cargado)
        const primera = cargado.variantes[0]
        if (primera) {
          setPrecio(formatAmount(primera.priceCents))
          setAnterior(primera.compareAtPriceCents ? formatAmount(primera.compareAtPriceCents) : '')
        }
      })
      .catch((e: Error) => setError(e.message))
  }, [id, esNueva])

  const precioCents = parseAmountToCents(precio)
  const anteriorCents = anterior.trim() === '' ? null : parseAmountToCents(anterior)

  // Las variantes se derivan de las opciones en cada render; `p.variantes`
  // guarda solo lo que se ha tocado a mano (precio, activa) y lo que ya existía.
  const variantes = useMemo(
    () =>
      p
        ? planearVariantes(
            p.code,
            p.opciones,
            p.variantes,
            { priceCents: precioCents ?? 0, compareAtPriceCents: anteriorCents },
            regenerar,
          )
        : [],
    [p, precioCents, anteriorCents, regenerar],
  )

  if (!p) {
    return (
      <View style={[s.screen, s.center]}>
        {error ? <Text style={s.body}>{error}</Text> : <ActivityIndicator color={color.primary} size="large" />}
      </View>
    )
  }

  const cambiar = (cambio: Partial<ProductoCompleto>) => setP({ ...p, ...cambio })

  function editarVariante(v: VarianteEditable, cambio: Partial<VarianteEditable>) {
    const clave = v.values.join('\u0000')
    const resto = p!.variantes.filter((x) => x.values.join('\u0000') !== clave)
    cambiar({ variantes: [...resto, { ...v, ...cambio }] })
  }

  function aplicarPrecioATodas() {
    if (precioCents == null) return
    cambiar({
      variantes: variantes.map((v) => ({ ...v, priceCents: precioCents, compareAtPriceCents: anteriorCents })),
    })
  }

  function agregarLinea(campo: 'materials' | 'care', linea: string) {
    const actual = p![campo]
    const lineas = actual.split('\n').map((l) => l.trim())
    if (lineas.some((l) => l.toLowerCase().startsWith(linea.toLowerCase()))) return
    cambiar({ [campo]: actual.trim() === '' ? linea : `${actual.trimEnd()}\n${linea}` })
  }

  function validar(): string | null {
    if (p!.name.trim().length < 2) return 'La prenda necesita un nombre'
    if (normalizarCodigo(p!.code) === '') return 'La prenda necesita un código base, por ejemplo 1234'
    if (p!.opciones.some((o) => o.values.length === 0)) {
      return 'Cada opción necesita al menos un valor, o quítala'
    }
    if (variantes.some((v) => v.priceCents <= 0)) return 'Todas las variantes necesitan precio'
    if (variantes.some((v) => v.compareAtPriceCents != null && v.compareAtPriceCents <= v.priceCents)) {
      return 'El precio anterior tiene que ser mayor que el precio, o quedarse vacío'
    }
    const repetidos = skusRepetidos(variantes)
    if (repetidos.length > 0) return `Hay códigos repetidos (${repetidos.join(', ')}): cambia un sufijo`
    return null
  }

  async function guardar() {
    const problema = validar()
    if (problema) {
      setError(problema)
      return
    }
    setGuardando(true)
    setError(null)
    setAviso(null)
    try {
      const nuevoId = await guardarProducto({ ...p!, code: normalizarCodigo(p!.code), variantes })
      setRegenerar(false)
      if (esNueva) {
        // A la ficha de la prenda recién creada: ahí ya se le pueden tomar fotos.
        router.replace({ pathname: '/productos/[id]', params: { id: nuevoId } })
        return
      }
      const recargado = await cargarProducto(nuevoId)
      setP(recargado)
      setAviso('Prenda guardada.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  function confirmarBorrado() {
    Alert.alert(
      `¿Eliminar «${p!.name}»?`,
      'Si ya tiene ventas o movimientos de inventario no se borra: se archiva y deja de venderse, pero su historia se conserva.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const archivada = await borrarProducto(p!.id!)
              if (archivada) {
                Alert.alert('Prenda archivada', 'Tenía historia, así que se archivó en lugar de borrarse.')
              }
              router.back()
            } catch (e) {
              setError((e as Error).message)
            }
          },
        },
      ],
    )
  }

  const hayGuardadas = variantes.some((v) => v.id)

  return (
    <View style={k.pantalla}>
      <View style={k.barra}>
        <Button label="← Productos" variant="subtle" onPress={() => router.back()} />
        <Text style={[s.headlineMd, s.fill]} numberOfLines={1}>
          {esNueva ? 'Nueva prenda' : p.name || 'Prenda'}
        </Text>
        {!esNueva ? <Button label="Eliminar" variant="subtle" onPress={confirmarBorrado} /> : null}
        <Button label={esNueva ? 'Crear prenda' : 'Guardar'} loading={guardando} onPress={() => void guardar()} />
      </View>

      {error || aviso ? (
        <View style={[k.mensaje, error ? k.mensajeError : null]}>
          <Text style={s.body}>{error ?? aviso}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={k.cuerpo} keyboardShouldPersistTaps="handled">
        {/* ---- Columna izquierda: qué es ---- */}
        <View style={k.columna}>
          <Seccion titulo="La prenda">
            <Field label="Nombre" value={p.name} onChangeText={(name) => cambiar({ name })} placeholder="Camisa de lino" />
            <Field
              label="Código base"
              value={p.code}
              onChangeText={(code) => cambiar({ code: normalizarCodigo(code) })}
              placeholder="1234"
              autoCapitalize="characters"
              autoCorrect={false}
              hint="Las variantes llevan este código más el de cada talla o color: 1234-CH."
            />
            <Field label="Marca" value={p.brand} onChangeText={(brand) => cambiar({ brand })} placeholder="Opcional" />
            <View style={k.grupo}>
              <Text style={s.label}>Categoría</Text>
              <View style={k.chips}>
                <Chip label="Sin categoría" active={p.categoryId === null} onPress={() => cambiar({ categoryId: null })} />
                {categorias.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.name}
                    active={p.categoryId === c.id}
                    onPress={() => cambiar({ categoryId: c.id })}
                  />
                ))}
              </View>
            </View>
            <Field
              label="Descripción corta"
              value={p.shortDescription}
              onChangeText={(shortDescription) => cambiar({ shortDescription })}
              placeholder="Una línea para la tarjeta de la tienda"
            />
            <Field
              label="Descripción"
              value={p.longDescription}
              onChangeText={(longDescription) => cambiar({ longDescription })}
              multiline
              style={k.multilinea}
              placeholder="Corte, largo, cómo queda…"
            />
          </Seccion>

          <Seccion titulo="Composición y cuidados">
            <Field
              label="Materiales"
              value={p.materials}
              onChangeText={(materials) => cambiar({ materials })}
              multiline
              style={k.multilinea}
              placeholder={'Algodón 95%\nElastano 5%'}
              hint="Un material por renglón, con su porcentaje."
            />
            <View style={k.chips}>
              {MATERIALES.map((m) => (
                <Chip key={m} label={`+ ${m}`} active={false} onPress={() => agregarLinea('materials', m)} />
              ))}
            </View>
            <Field
              label="Cuidados"
              value={p.care}
              onChangeText={(care) => cambiar({ care })}
              multiline
              style={k.multilinea}
              placeholder="Lavar a mano con agua fría"
              hint="Un cuidado por renglón. Se ven en la ficha de la tienda."
            />
            <View style={k.chips}>
              {CUIDADOS.map((c) => (
                <Chip key={c} label={`+ ${c}`} active={false} onPress={() => agregarLinea('care', c)} />
              ))}
            </View>
          </Seccion>

          <Seccion titulo="Dónde se vende">
            <View style={k.chips}>
              {ESTADOS.map((e) => (
                <Chip key={e.key} label={e.label} active={p.status === e.key} onPress={() => cambiar({ status: e.key })} />
              ))}
            </View>
            <Text style={s.bodyMuted}>
              {p.status === 'active'
                ? 'Se vende en la boutique.'
                : p.status === 'draft'
                  ? 'Borrador: no se vende en ningún lado todavía.'
                  : 'Archivada: ya no se vende, pero conserva su historia.'}
            </Text>
            <View style={k.interruptor}>
              <View style={s.fill}>
                <Text style={s.body}>También en la tienda en línea</Text>
                <Text style={s.bodyMuted}>Apagado, la prenda es solo para la boutique.</Text>
              </View>
              <Switch
                value={p.isOnline}
                onValueChange={(isOnline) => cambiar({ isOnline })}
                trackColor={{ true: color.primary, false: color['surface-variant'] }}
              />
            </View>
          </Seccion>

          <Seccion titulo="Fotos">
            <FotosEditor productId={p.id} fotos={p.fotos} onChange={(fotos) => cambiar({ fotos })} />
          </Seccion>
        </View>

        {/* ---- Columna derecha: cómo se vende ---- */}
        <View style={k.columna}>
          <Seccion titulo="Precio">
            <View style={k.dos}>
              <View style={s.fill}>
                <Field
                  label="Precio"
                  value={precio}
                  onChangeText={setPrecio}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </View>
              <View style={s.fill}>
                <Field
                  label="Precio anterior"
                  value={anterior}
                  onChangeText={setAnterior}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  placeholder="Opcional, para rebaja"
                />
              </View>
            </View>
            <Text style={s.bodyMuted}>
              Es el precio de las variantes nuevas. Cada variante puede tener el suyo abajo.
            </Text>
            {hayGuardadas ? (
              <Button label="Aplicar a todas las variantes" variant="outline" onPress={aplicarPrecioATodas} />
            ) : null}
          </Seccion>

          <Seccion titulo="Opciones">
            <OpcionesEditor opciones={p.opciones} onChange={(opciones) => cambiar({ opciones })} />
          </Seccion>

          <Seccion titulo={`Variantes (${variantes.length})`}>
            {hayGuardadas ? (
              <View style={k.interruptor}>
                <View style={s.fill}>
                  <Text style={s.body}>Regenerar códigos</Text>
                  <Text style={s.bodyMuted}>
                    Las variantes guardadas conservan su código. Enciéndelo para rehacerlos con el código
                    base y los sufijos actuales.
                  </Text>
                </View>
                <Switch
                  value={regenerar}
                  onValueChange={setRegenerar}
                  trackColor={{ true: color.primary, false: color['surface-variant'] }}
                />
              </View>
            ) : null}

            {variantes.map((v) => (
              <FilaVariante
                key={v.values.join('|') || 'unica'}
                v={v}
                existencias={v.id ? (p.existencias[v.id] ?? 0) : null}
                onChange={(cambio) => editarVariante(v, cambio)}
              />
            ))}
            <Text style={s.bodyMuted}>
              Las existencias se cargan en Inventario. Una variante apagada no se vende.
            </Text>
          </Seccion>
        </View>
      </ScrollView>
    </View>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View style={k.seccion}>
      <Text style={s.label}>{titulo}</Text>
      {children}
    </View>
  )
}

function FilaVariante({
  v,
  existencias,
  onChange,
}: {
  v: VarianteEditable
  existencias: number | null
  onChange: (c: Partial<VarianteEditable>) => void
}) {
  // El texto se edita libre y se convierte al salir: convertir en cada tecla
  // haría imposible escribir «12.5».
  const [texto, setTexto] = useState(formatAmount(v.priceCents))
  useEffect(() => setTexto(formatAmount(v.priceCents)), [v.priceCents])

  return (
    <View style={[k.variante, !v.isActive && k.varianteApagada]}>
      <View style={s.fill}>
        <Text style={s.body}>{v.values.length > 0 ? v.values.join(' / ') : 'Única'}</Text>
        <Text style={k.meta}>
          {v.sku || 'Falta el código base'}
          {existencias != null ? ` · ${existencias} en tienda` : ' · nueva'}
        </Text>
      </View>
      <TextInput
        value={texto}
        onChangeText={setTexto}
        onBlur={() => {
          const c = parseAmountToCents(texto)
          if (c != null) onChange({ priceCents: c })
          else setTexto(formatAmount(v.priceCents))
        }}
        keyboardType="decimal-pad"
        inputMode="decimal"
        style={k.precio}
        accessibilityLabel={`Precio de ${v.values.join(' ') || 'la variante'}`}
      />
      <Switch
        value={v.isActive}
        onValueChange={(isActive) => onChange({ isActive })}
        trackColor={{ true: color.primary, false: color['surface-variant'] }}
        accessibilityLabel="Activa"
      />
    </View>
  )
}

const k = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.surface },
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gutter,
    paddingHorizontal: space.edge,
    paddingVertical: space.gap,
    borderBottomWidth: 1,
    borderBottomColor: color['surface-variant'],
    backgroundColor: color['paper-bright'],
  },
  mensaje: {
    marginHorizontal: space.edge,
    marginTop: space.gap,
    padding: space.gutter,
    borderWidth: 1,
    borderColor: color['surface-variant'],
  },
  mensajeError: { borderWidth: size.border, borderColor: color.primary },
  cuerpo: { flexDirection: 'row', alignItems: 'flex-start', gap: space.gutter, padding: space.edge },
  columna: { flex: 1, gap: space.gutter },
  seccion: {
    backgroundColor: color['paper-bright'],
    borderWidth: 1,
    borderColor: color.primary,
    padding: space.edge,
    gap: space.gutter,
  },
  grupo: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gap },
  multilinea: { minHeight: 88, textAlignVertical: 'top' },
  interruptor: { flexDirection: 'row', alignItems: 'center', gap: space.gap },
  dos: { flexDirection: 'row', gap: space.gap },
  variante: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gap,
    minHeight: size.touchMin,
    borderBottomWidth: 1,
    borderBottomColor: color['surface-variant'],
    paddingVertical: 6,
  },
  varianteApagada: { opacity: 0.5 },
  meta: { ...text.bodyMd, fontSize: 12, color: color['text-muted'] },
  precio: {
    ...text.price,
    width: 110,
    minHeight: 40,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: color['outline-variant'],
    color: color.primary,
    textAlign: 'right',
  },
})
