import { useState } from 'react'
import { Alert, StyleSheet, Switch, Text, View } from 'react-native'

import { Button } from '@/ui/Button'
import { Chip } from '@/ui/Chip'
import { Field } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { color, s, space } from '@/theme'
import { borrarCategoria, guardarCategoria, type Categoria } from './datos.ts'

/**
 * Alta, edición y borrado de una categoría.
 *
 * Solo dos niveles —madre e hija—, que es lo que pinta el menú de la tienda.
 * Por eso la lista de madres posibles excluye a las que ya son hijas.
 */
export function CategoriaSheet({
  categoria,
  categorias,
  onClose,
  onHecho,
}: {
  categoria: Categoria | null
  categorias: Categoria[]
  onClose: () => void
  onHecho: () => void
}) {
  const [nombre, setNombre] = useState(categoria?.name ?? '')
  const [madre, setMadre] = useState<string | null>(categoria?.parentId ?? null)
  const [visible, setVisible] = useState(categoria?.isVisible ?? true)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const madresPosibles = categorias.filter((c) => !c.parentId && c.id !== categoria?.id)
  // Una categoría que ya tiene hijas no puede volverse hija de otra.
  const tieneHijas = categoria ? categorias.some((c) => c.parentId === categoria.id) : false

  async function guardar() {
    setOcupado(true)
    setError(null)
    try {
      await guardarCategoria({ id: categoria?.id ?? null, name: nombre, parentId: madre, isVisible: visible })
      onHecho()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  function confirmarBorrado() {
    if (!categoria) return
    const aviso =
      categoria.productos > 0
        ? `Sus ${categoria.productos} prendas se quedan sin categoría; no se borra ninguna.`
        : 'No tiene prendas.'
    Alert.alert(`¿Borrar «${categoria.name}»?`, aviso, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          setOcupado(true)
          try {
            await borrarCategoria(categoria.id)
            onHecho()
          } catch (e) {
            setError((e as Error).message)
            setOcupado(false)
          }
        },
      },
    ])
  }

  return (
    <Sheet
      eyebrow="Categoría"
      title={categoria ? categoria.name : 'Nueva categoría'}
      onClose={onClose}
      error={error}
      action={{
        label: categoria ? 'Guardar' : 'Crear categoría',
        onPress: () => void guardar(),
        loading: ocupado,
        disabled: nombre.trim() === '',
      }}
    >
      <Field label="Nombre" value={nombre} onChangeText={setNombre} placeholder="Vestidos" autoFocus={!categoria} />

      {!tieneHijas && madresPosibles.length > 0 ? (
        <View style={c.bloque}>
          <Text style={s.label}>Dentro de</Text>
          <View style={c.chips}>
            <Chip label="Ninguna" active={madre === null} onPress={() => setMadre(null)} />
            {madresPosibles.map((m) => (
              <Chip key={m.id} label={m.name} active={madre === m.id} onPress={() => setMadre(m.id)} />
            ))}
          </View>
        </View>
      ) : null}

      <View style={c.interruptor}>
        <View style={s.fill}>
          <Text style={s.body}>Se ve en la tienda en línea</Text>
          <Text style={s.bodyMuted}>Apagada, la categoría sirve solo para ordenar en la boutique.</Text>
        </View>
        <Switch
          value={visible}
          onValueChange={setVisible}
          trackColor={{ true: color.primary, false: color['surface-variant'] }}
        />
      </View>

      {categoria ? (
        <Button label="Borrar categoría" variant="subtle" disabled={ocupado} onPress={confirmarBorrado} />
      ) : null}
    </Sheet>
  )
}

const c = StyleSheet.create({
  bloque: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gap },
  interruptor: { flexDirection: 'row', alignItems: 'center', gap: space.gap },
})
