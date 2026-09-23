import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { formatPrice, parseAmountToCents } from '@lumane/core'
import { errorMessage } from '@lumane/db'

import { supabase } from '@/lib/supabase'
import { useSession } from '@/lib/session'
import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { color, s, space } from '@/theme'
import type { FilaInventario } from './useInventory.ts'

/**
 * Los dos movimientos de una pieza: recibir mercancía y corregir existencias.
 *
 * Van juntos en una hoja porque se llega a los dos por el mismo camino —tocar
 * una prenda en la lista— y separarlos obligaría a volver atrás para descubrir
 * que se eligió mal.
 *
 * **La diferencia entre los dos no es cosmética y la hoja la explica.**
 * Recibir SUMA y registra un movimiento de compra con su costo; ajustar FIJA
 * el número y registra la diferencia con un motivo. Confundirlos es lo que
 * convierte un inventario en un número en el que nadie confía.
 */

type Modo = 'recibir' | 'ajustar'

export function MovimientoSheet({
  fila,
  onClose,
  onHecho,
}: {
  fila: FilaInventario
  onClose: () => void
  onHecho: () => void
}) {
  const { can } = useSession()
  const [modo, setModo] = useState<Modo | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [costo, setCosto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const puedeRecibir = can('inventory.write')
  const puedeAjustar = can('inventory.adjust')

  const n = Number(cantidad.trim())
  const valida = Number.isInteger(n) && n >= 0 && cantidad.trim() !== ''
  const delta = modo === 'ajustar' && valida ? n - fila.on_hand : null

  async function enviar() {
    if (!valida) {
      setError('Escribe un número entero de piezas')
      return
    }
    if (modo === 'recibir' && n === 0) {
      setError('¿Cuántas piezas llegaron?')
      return
    }

    setEnviando(true)
    setError(null)

    const { error: fallo } =
      modo === 'recibir'
        ? await supabase.rpc('receive_stock', {
            p_variant_id: fila.variant_id,
            p_quantity: n,
            p_unit_cost_cents: parseAmountToCents(costo) ?? undefined,
            p_note: motivo.trim() || undefined,
          })
        : await supabase.rpc('adjust_inventory', {
            p_variant_id: fila.variant_id,
            p_new_quantity: n,
            p_reason: motivo.trim() || 'Ajuste desde el mostrador',
          })

    setEnviando(false)
    if (fallo) {
      setError(errorMessage(fallo))
      return
    }
    onHecho()
    onClose()
  }

  return (
    <Sheet
      eyebrow={`${fila.product_name} · ${fila.variant_title}`}
      title={modo === null ? `${fila.on_hand} en existencia` : modo === 'recibir' ? 'Recibir' : 'Corregir'}
      onClose={onClose}
      closeLabel={modo === null ? 'Volver' : 'Cancelar'}
      action={
        modo === null
          ? undefined
          : {
              label: enviando
                ? 'Registrando…'
                : modo === 'recibir'
                  ? 'Registrar entrada'
                  : 'Corregir existencias',
              onPress: () => void enviar(),
              loading: enviando,
              disabled: !valida,
            }
      }
      error={error}
    >
      <View style={m.datos}>
        <Dato etiqueta="SKU" valor={fila.sku} />
        <Dato etiqueta="Precio" valor={formatPrice(fila.price_cents)} />
        <Dato etiqueta="En existencia" valor={String(fila.on_hand)} />
        <Dato etiqueta="Apartadas" valor={String(fila.reserved)} />
        <Dato etiqueta="Disponibles" valor={String(fila.available)} />
        {fila.bin_location ? <Dato etiqueta="Ubicación" valor={fila.bin_location} /> : null}
      </View>

      {fila.reserved > 0 ? (
        <Text style={s.bodyMuted}>
          {`${fila.reserved} ${fila.reserved === 1 ? 'pieza está apartada' : 'piezas están apartadas'} por un carrito de la tienda en línea. Se liberan solas si la compra no se termina.`}
        </Text>
      ) : null}

      {modo === null ? (
        <View style={m.opciones}>
          {puedeRecibir ? (
            <Button
              label="Llegó mercancía"
              variant="outline"
              size="lg"
              fullWidth
              onPress={() => {
                setError(null)
                setCantidad('')
                setModo('recibir')
              }}
            />
          ) : null}
          {puedeAjustar ? (
            <Button
              label="Corregir existencias"
              variant="outline"
              size="lg"
              fullWidth
              onPress={() => {
                setError(null)
                setCantidad(String(fila.on_hand))
                setModo('ajustar')
              }}
            />
          ) : null}
          {!puedeRecibir && !puedeAjustar ? (
            <Text style={s.bodyMuted}>No tienes permiso para mover inventario.</Text>
          ) : null}
        </View>
      ) : null}

      {modo === 'recibir' ? (
        <View style={m.formulario}>
          <Field
            label="¿Cuántas piezas llegaron?"
            value={cantidad}
            onChangeText={setCantidad}
            keyboardType="number-pad"
            autoFocus
            editable={!enviando}
            hint={`Se SUMAN a las ${fila.on_hand} que ya hay.`}
          />
          <Field
            label="Costo por pieza (opcional)"
            value={costo}
            onChangeText={setCosto}
            keyboardType="decimal-pad"
            editable={!enviando}
            hint="Si lo escribes, actualiza el costo de la variante. Sirve para saber cuánto vale el inventario."
          />
          <Field
            label="Nota (opcional)"
            value={motivo}
            onChangeText={setMotivo}
            editable={!enviando}
            hint="El proveedor, el número de factura: lo que ayude a reconocer esta entrada después."
          />
          {valida && n > 0 ? (
            <View style={m.resumen}>
              <Text style={s.body}>{`${fila.on_hand} + ${n} = ${fila.on_hand + n} piezas`}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {modo === 'ajustar' ? (
        <View style={m.formulario}>
          <Field
            label="¿Cuántas hay de verdad?"
            value={cantidad}
            onChangeText={setCantidad}
            keyboardType="number-pad"
            autoFocus
            editable={!enviando}
            hint="El número que acabas de contar. NO se suma: sustituye al actual."
          />
          <Field
            label="Motivo"
            value={motivo}
            onChangeText={setMotivo}
            editable={!enviando}
            hint="Queda escrito para siempre junto al movimiento. «Conteo», «se rompió una», «apareció en el almacén»."
          />
          {/* El DELTA en grande, no el número final: es lo que delata un error
              de tecleo. Escribir 20 donde iban 2 se ve como «+18», y eso sí
              llama la atención antes de confirmar. */}
          {delta !== null ? (
            <View style={m.resumen}>
              <Text style={s.label}>Diferencia</Text>
              <Text style={s.priceDisplay}>
                {delta === 0 ? 'Sin cambio' : delta > 0 ? `+${delta}` : String(delta)}
              </Text>
              <Text style={s.bodyMuted}>{`De ${fila.on_hand} a ${n}`}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={s.rowBetween}>
      <Text style={s.label}>{etiqueta}</Text>
      <Text style={s.body}>{valor}</Text>
    </View>
  )
}

const m = StyleSheet.create({
  datos: { gap: 4 },
  opciones: { gap: space.gap },
  formulario: { gap: space.gutter },
  resumen: {
    borderWidth: 2,
    borderColor: color.primary,
    padding: space.gutter,
    alignItems: 'center',
    gap: 2,
  },
})
