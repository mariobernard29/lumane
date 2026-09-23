import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { formatPrice } from '@lumane/core'
import { errorMessage } from '@lumane/db'

import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { color, s, space } from '@/theme'
import { destinosDisponibles, type DestinoTicket } from './destinos.ts'

/**
 * Lo que se ve justo después de cobrar.
 *
 * Su trabajo principal NO es el ticket: es enseñar el cambio, que es lo que la
 * cajera tiene que leer para devolverlo bien y con la clienta delante. Por eso
 * va en la tipografía más grande del sistema.
 *
 * El ticket viene después, opcional y en segundo plano. **Pedir el correo
 * ANTES de cobrar metería un campo en el camino crítico de todas las ventas
 * para servir a la minoría que lo quiere**, y el objetivo del mostrador son
 * quince segundos por venta. Aquí ya se cobró: el tiempo que se gaste es de
 * quien quiso gastarlo.
 *
 * «Listo» cierra sin más. Es el camino de siempre y por eso es el botón grande.
 */

export function SaleDoneSheet({
  orderId,
  orderNumber,
  changeCents,
  correoSugerido,
  onClose,
}: {
  orderId: string
  orderNumber: string
  changeCents: number
  /** El de la clienta asociada, si la venta llevaba una. */
  correoSugerido?: string | null
  onClose: () => void
}) {
  const destinos = destinosDisponibles()
  const [destino, setDestino] = useState<DestinoTicket | null>(null)
  const [dato, setDato] = useState(correoSugerido ?? '')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function mandar(d: DestinoTicket) {
    if (d.pide && dato.trim() === '') {
      setError(`Escribe ${d.pide.label.toLowerCase()} antes de mandarlo`)
      return
    }
    setEnviando(true)
    setError(null)
    try {
      await d.enviar(orderId, dato)
      setEnviado(dato.trim() || 'la clienta')
      setDestino(null)
      setDato('')
    } catch (e) {
      setError(errorMessage(e as { message?: string }))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Sheet
      eyebrow={`Venta ${orderNumber}`}
      title={changeCents > 0 ? formatPrice(changeCents, true) : 'Cobrada'}
      titleIsMoney={changeCents > 0}
      onClose={onClose}
      closeLabel="Listo"
      action={{ label: 'Listo', onPress: onClose }}
      error={error}
    >
      {changeCents > 0 ? (
        <Text style={s.bodyLg}>Cambio para la clienta.</Text>
      ) : (
        <Text style={s.bodyMuted}>Pago exacto, sin cambio.</Text>
      )}

      {enviado ? (
        <View style={d.aviso}>
          <Text style={s.body}>{`Ticket mandado a ${enviado}.`}</Text>
          <Text style={s.bodyMuted}>
            Puede tardar hasta un minuto en llegar. Si la clienta no lo ve, que revise el correo no
            deseado.
          </Text>
        </View>
      ) : destino ? (
        <View style={d.bloque}>
          <Field
            label={destino.pide!.label}
            value={dato}
            onChangeText={setDato}
            placeholder={destino.pide!.placeholder}
            autoCapitalize="none"
            keyboardType="email-address"
            inputMode="email"
            autoFocus
            editable={!enviando}
            returnKeyType="send"
            onSubmitEditing={() => void mandar(destino)}
          />
          <Button
            label={enviando ? 'Mandando…' : destino.label}
            size="lg"
            fullWidth
            loading={enviando}
            onPress={() => void mandar(destino)}
          />
          <Button
            label="Sin ticket"
            variant="subtle"
            onPress={() => {
              setDestino(null)
              setError(null)
            }}
          />
        </View>
      ) : (
        <View style={d.bloque}>
          {destinos.map((x) => (
            <Button
              key={x.key}
              label={x.label}
              variant="outline"
              size="lg"
              fullWidth
              onPress={() => {
                setError(null)
                // Un destino que no pide nada se manda de una vez: el día de la
                // impresora, «Imprimir» será un solo toque.
                if (x.pide) setDestino(x)
                else void mandar(x)
              }}
            />
          ))}
        </View>
      )}
    </Sheet>
  )
}

const d = StyleSheet.create({
  bloque: { gap: space.gap },
  aviso: { borderWidth: 1, borderColor: color.primary, padding: space.gutter, gap: 4 },
})
