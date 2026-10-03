import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { color, s, size, space, text } from '@/theme'

/**
 * Los botones del mostrador.
 *
 * Las variantes son las mismas que en la web —sólido, contorno, sobre oscuro,
 * tenue— con la misma regla de inversión al pulsar. Lo que cambia es la
 * ALTURA: aquí el mínimo es 56 puntos y el botón de cobrar mide 72, porque lo
 * pulsa alguien de pie, con prisa y a veces con una prenda en la otra mano.
 *
 * No hay estado `hover`: en una tablet no existe. El equivalente es `pressed`,
 * que invierte los colores igual que el hover de la web.
 */

export type ButtonVariant = 'solid' | 'outline' | 'onDark' | 'subtle' | 'danger'
export type ButtonSize = 'md' | 'lg' | 'charge'

interface ButtonProps {
  label: string
  onPress: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  loading?: boolean
  fullWidth?: boolean
  /** Importe u otro dato que va a la derecha, alineado al borde. */
  trailing?: string
}

const ALTURAS: Record<ButtonSize, number> = {
  md: size.touchMin,
  lg: size.action,
  charge: size.charge,
}

export function Button({
  label,
  onPress,
  variant = 'solid',
  size: tamaño = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  trailing,
}: ButtonProps) {
  const inhabilitado = disabled || loading

  return (
    <Pressable
      onPress={onPress}
      disabled={inhabilitado}
      accessibilityRole="button"
      accessibilityState={{ disabled: inhabilitado, busy: loading }}
      style={({ pressed }) => [
        base.botón,
        { height: ALTURAS[tamaño] },
        fullWidth && { alignSelf: 'stretch' },
        variantes[variant].caja,
        pressed && !inhabilitado && variantes[variant].cajaPulsada,
        inhabilitado && base.inhabilitado,
      ]}
    >
      {({ pressed }) => (
        <View style={[s.row, base.contenido]}>
          {loading ? (
            <ActivityIndicator
              color={variant === 'solid' || variant === 'danger' ? color['on-primary'] : color.primary}
            />
          ) : (
            <>
              <Text
                numberOfLines={1}
                style={[
                  base.texto,
                  variantes[variant].texto,
                  pressed && !inhabilitado && variantes[variant].textoPulsado,
                ]}
              >
                {label}
              </Text>
              {trailing ? (
                <Text
                  style={[
                    base.texto,
                    base.trailing,
                    variantes[variant].texto,
                    pressed && !inhabilitado && variantes[variant].textoPulsado,
                  ]}
                >
                  {trailing}
                </Text>
              ) : null}
            </>
          )}
        </View>
      )}
    </Pressable>
  )
}

const base = StyleSheet.create({
  botón: {
    borderRadius: size.radius,
    borderWidth: size.hairline,
    justifyContent: 'center',
    paddingHorizontal: space.edge,
  },
  contenido: { justifyContent: 'center', gap: space.gap },
  texto: { ...text.labelUpper, textAlign: 'center' },
  trailing: { marginLeft: 'auto' },
  // Sin gris nuevo: se baja la opacidad del propio botón. Añadir un color de
  // "inhabilitado" metería un tono que no está en la paleta.
  inhabilitado: { opacity: 0.35 },
})

const variantes: Record<
  ButtonVariant,
  { caja: object; cajaPulsada: object; texto: object; textoPulsado: object }
> = {
  solid: {
    caja: { backgroundColor: color.primary, borderColor: color.primary },
    cajaPulsada: { backgroundColor: color['paper-bright'] },
    texto: { color: color['on-primary'] },
    textoPulsado: { color: color.primary },
  },
  outline: {
    caja: { backgroundColor: 'transparent', borderColor: color.primary },
    cajaPulsada: { backgroundColor: color.primary },
    texto: { color: color.primary },
    textoPulsado: { color: color['on-primary'] },
  },
  onDark: {
    caja: { backgroundColor: 'transparent', borderColor: color['on-tertiary'] },
    cajaPulsada: { backgroundColor: color['on-tertiary'] },
    texto: { color: color['on-tertiary'] },
    textoPulsado: { color: color['editorial-ink'] },
  },
  subtle: {
    caja: { backgroundColor: 'transparent', borderColor: color['outline-variant'] },
    cajaPulsada: { backgroundColor: color['surface-variant'] },
    texto: { color: color.secondary },
    textoPulsado: { color: color.primary },
  },
  /**
   * Para quitar una línea o anular una venta. En un sistema monocromo no puede
   * ser roja, así que lo destructivo se marca con el peso del negro sólido y
   * con dónde está puesto, nunca con color.
   */
  danger: {
    caja: { backgroundColor: color['editorial-ink'], borderColor: color['editorial-ink'] },
    cajaPulsada: { backgroundColor: color['paper-bright'] },
    texto: { color: color['on-primary'] },
    textoPulsado: { color: color['editorial-ink'] },
  },
}
