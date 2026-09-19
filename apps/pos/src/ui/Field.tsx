import { forwardRef, useState } from 'react'
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'

import { color, s, size, space, text } from '@/theme'

/**
 * Campo de texto con regla inferior: el `.input-minimal` del prototipo,
 * traducido a la tablet.
 *
 * La etiqueta va SIEMPRE visible encima y nunca como marcador de posición
 * dentro del campo. Un placeholder que hace de etiqueta desaparece justo
 * cuando empiezas a escribir, que es cuando más falta hace saber qué se estaba
 * escribiendo — y en un mostrador, con interrupciones cada minuto, eso se nota.
 */

interface FieldProps extends TextInputProps {
  label: string
  hint?: string
  error?: string | null
}

export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, hint, error, style, ...props },
  ref,
) {
  const [enfocado, setEnfocado] = useState(false)

  return (
    <View style={f.grupo}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor={color['outline-variant']}
        {...props}
        onFocus={(e) => {
          setEnfocado(true)
          props.onFocus?.(e)
        }}
        onBlur={(e) => {
          setEnfocado(false)
          props.onBlur?.(e)
        }}
        style={[s.input, enfocado && s.inputFocused, error ? f.conError : null, style]}
      />
      {error ? (
        <Text style={f.error}>{error}</Text>
      ) : hint ? (
        <Text style={f.pista}>{hint}</Text>
      ) : null}
    </View>
  )
})

const f = StyleSheet.create({
  grupo: { gap: 6 },
  // El error no se marca con color —el sistema es monocromo— sino con el peso
  // del borde y con el texto debajo, que además dice qué hacer.
  conError: { borderBottomWidth: size.border, borderBottomColor: color.primary },
  error: { ...text.bodyMd, fontSize: 13, color: color.primary },
  pista: { ...text.bodyMd, fontSize: 13, color: color['text-muted'] },
})

/** Separación estándar entre campos de un mismo formulario. */
export const formGap = space.gutter
