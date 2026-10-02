import { useState } from 'react'
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { imageUrl } from '@lumane/db'

import { supabaseUrl } from '@/lib/supabase'
import { Button } from '@/ui/Button'
import { color, s, space, text } from '@/theme'
import { quitarFoto, subirFoto, type Foto } from './datos.ts'

/**
 * Las fotos de la prenda: tomarlas con la cámara de la tablet o elegirlas de
 * la galería. La primera es la portada en la tienda y en la venta.
 *
 * Se suben al momento, no al pulsar «Guardar»: una foto ya subida no se
 * pierde si luego falla otro campo. Por eso hace falta que la prenda exista.
 */
export function FotosEditor({
  productId,
  fotos,
  onChange,
}: {
  productId: string | null
  fotos: Foto[]
  onChange: (f: Foto[]) => void
}) {
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!productId) {
    return (
      <Text style={s.bodyMuted}>
        Guarda la prenda primero; después podrás tomarle fotos desde aquí.
      </Text>
    )
  }

  async function agregar(origen: 'camara' | 'galeria') {
    setError(null)
    const permiso =
      origen === 'camara'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permiso.granted) {
      setError(origen === 'camara' ? 'Sin permiso para usar la cámara' : 'Sin permiso para ver la galería')
      return
    }

    const opciones: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 1,
      allowsMultipleSelection: origen === 'galeria',
      selectionLimit: 8,
    }
    const resultado =
      origen === 'camara'
        ? await ImagePicker.launchCameraAsync(opciones)
        : await ImagePicker.launchImageLibraryAsync(opciones)
    if (resultado.canceled) return

    setSubiendo(true)
    let actuales = fotos
    try {
      for (const asset of resultado.assets) {
        const foto = await subirFoto(
          productId!,
          asset.uri,
          { width: asset.width, height: asset.height },
          actuales.length,
        )
        actuales = [...actuales, foto]
        onChange(actuales)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubiendo(false)
    }
  }

  function confirmarQuitar(foto: Foto) {
    Alert.alert('¿Quitar esta foto?', 'Deja de verse en la tienda y en la venta.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          try {
            await quitarFoto(foto.id)
            onChange(fotos.filter((f) => f.id !== foto.id))
          } catch (e) {
            setError((e as Error).message)
          }
        },
      },
    ])
  }

  return (
    <View style={f.bloque}>
      {fotos.length > 0 ? (
        <ScrollView horizontal contentContainerStyle={f.tira} showsHorizontalScrollIndicator={false}>
          {fotos.map((foto, i) => (
            <Pressable
              key={foto.id}
              onLongPress={() => confirmarQuitar(foto)}
              accessibilityRole="imagebutton"
              accessibilityHint="Mantén pulsado para quitarla"
            >
              <Image source={{ uri: imageUrl(supabaseUrl, foto.path) }} style={f.foto} />
              <Text style={f.pie}>{i === 0 ? 'Portada' : `Foto ${i + 1}`}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <Text style={s.bodyMuted}>Sin fotos todavía.</Text>
      )}

      {fotos.length > 0 ? <Text style={f.ayuda}>Mantén pulsada una foto para quitarla.</Text> : null}
      {error ? <Text style={s.body}>{error}</Text> : null}

      <View style={f.botones}>
        <View style={s.fill}>
          <Button
            label={subiendo ? 'Subiendo…' : 'Tomar foto'}
            variant="outline"
            fullWidth
            loading={subiendo}
            onPress={() => void agregar('camara')}
          />
        </View>
        <View style={s.fill}>
          <Button
            label="Elegir de la galería"
            variant="outline"
            fullWidth
            disabled={subiendo}
            onPress={() => void agregar('galeria')}
          />
        </View>
      </View>
    </View>
  )
}

const f = StyleSheet.create({
  bloque: { gap: space.gap },
  tira: { gap: space.gap },
  foto: { width: 120, height: 150, backgroundColor: color['surface-container'] },
  pie: { ...text.labelUpper, fontSize: 10, color: color['text-muted'], marginTop: 4 },
  ayuda: { ...text.bodyMd, fontSize: 12, color: color['text-muted'] },
  botones: { flexDirection: 'row', gap: space.gap },
})
