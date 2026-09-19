import { useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  cashShortcuts,
  formatPrice,
  parseAmountToCents,
  summarizePayments,
  type DraftPayment,
  type PaymentMethod,
} from '@lumane/core'

import type { useSaleCart } from './useSaleCart.ts'
import { supabase } from '@/lib/supabase'
import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { color, elevation, s, size, space, text } from '@/theme'

/**
 * El cobro.
 *
 * Se abre encima de la venta y no en otra pantalla: la cajera tiene que poder
 * ver lo que está cobrando mientras cuenta el dinero, y volver atrás sin
 * perder el carrito.
 *
 * El caso normal —un solo medio de pago— se resuelve en dos toques: elegir
 * "Efectivo", tocar el botón del billete que le dieron, cobrar. Los pagos
 * mixtos existen porque ocurren, pero no estorban al caso normal: solo
 * aparecen cuando se añade un segundo medio.
 *
 * Nada de lo que se calcula aquí decide el importe. `pos_create_sale` recalcula
 * el total contra la base y ABORTA si los pagos no lo cubren exactamente.
 */

const MEDIOS: { key: PaymentMethod; label: string }[] = [
  { key: 'cash', label: 'Efectivo' },
  { key: 'card', label: 'Tarjeta' },
  { key: 'transfer', label: 'Transferencia' },
]

interface Props {
  carrito: ReturnType<typeof useSaleCart>
  onCancelar: () => void
  onCobrada: (orderNumber: string, orderId: string) => void
}

export function ChargeSheet({ carrito, onCancelar, onCobrada }: Props) {
  const total = carrito.totals.totalCents

  const [pagos, setPagos] = useState<DraftPayment[]>([])
  const [medio, setMedio] = useState<PaymentMethod>('cash')
  const [recibido, setRecibido] = useState('')
  const [referencia, setReferencia] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const resumen = useMemo(() => summarizePayments(pagos, total), [pagos, total])
  const atajos = useMemo(() => cashShortcuts(resumen.dueCents), [resumen.dueCents])

  const recibidoCents = parseAmountToCents(recibido)
  const esEfectivo = medio === 'cash'

  /** Lo que este medio aporta: nunca más de lo que falta por cubrir. */
  const aporte = esEfectivo
    ? Math.min(recibidoCents ?? 0, resumen.dueCents)
    : resumen.dueCents

  const puedeAñadir = esEfectivo ? (recibidoCents ?? 0) > 0 : resumen.dueCents > 0

  function añadirPago() {
    if (!puedeAñadir) return

    const pago: DraftPayment = esEfectivo
      ? { method: 'cash', amountCents: aporte, tenderedCents: recibidoCents ?? 0 }
      : {
          method: medio,
          amountCents: aporte,
          ...(referencia.trim() ? { reference: referencia.trim() } : {}),
        }

    setPagos((actuales) => [...actuales, pago])
    setRecibido('')
    setReferencia('')
    setError(null)
  }

  async function cobrar() {
    // Se compone el pago que falta sin obligar a pulsar "Añadir": en la venta
    // de un solo medio, ese toque extra no aporta nada.
    const definitivos =
      resumen.isSettled || !puedeAñadir
        ? pagos
        : [
            ...pagos,
            esEfectivo
              ? ({ method: 'cash', amountCents: aporte, tenderedCents: recibidoCents ?? 0 } as DraftPayment)
              : ({
                  method: medio,
                  amountCents: aporte,
                  ...(referencia.trim() ? { reference: referencia.trim() } : {}),
                } as DraftPayment),
          ]

    const comprobación = summarizePayments(definitivos, total)
    if (!comprobación.isSettled) {
      setError(`Faltan ${formatPrice(comprobación.dueCents, true)} por cubrir`)
      return
    }

    setError(null)
    setEnviando(true)

    const payload = carrito.buildPayload(
      definitivos.map((p) => ({
        method: p.method,
        amount_cents: p.amountCents,
        ...(p.tenderedCents != null ? { tendered_cents: p.tenderedCents } : {}),
        ...(p.reference ? { reference: p.reference } : {}),
      })),
    )

    const { data, error: fallo } = await supabase.rpc('pos_create_sale', { p_payload: payload })

    setEnviando(false)

    if (fallo) {
      // El mensaje de la base está escrito para leerse en el mostrador: "No
      // hay caja abierta", "Los pagos suman X y el total es Y". Se muestra tal
      // cual en lugar de sustituirlo por un "algo salió mal" genérico.
      setError(fallo.message)
      return
    }

    const venta = data as unknown as { order: { id: string; order_number: string } }
    onCobrada(venta.order.order_number, venta.order.id)
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onCancelar}>
      <View style={c.fondo}>
        <Pressable style={s.fill} onPress={onCancelar} accessibilityLabel="Cerrar el cobro" />

        <View style={[c.hoja, elevation]}>
          <View style={c.cabecera}>
            <View>
              <Text style={s.label}>Cobrar</Text>
              <Text style={s.priceDisplay}>{formatPrice(total, true)}</Text>
            </View>
            <Button label="Volver" variant="subtle" onPress={onCancelar} />
          </View>

          <ScrollView contentContainerStyle={c.cuerpo} keyboardShouldPersistTaps="handled">
            {pagos.length > 0 ? (
              <View style={c.bloque}>
                {pagos.map((p, i) => (
                  <View key={`${p.method}-${i}`} style={s.rowBetween}>
                    <Text style={s.body}>
                      {MEDIOS.find((m) => m.key === p.method)?.label ?? p.method}
                    </Text>
                    <View style={s.row}>
                      <Text style={s.price}>{formatPrice(p.amountCents, true)}</Text>
                      <Pressable
                        onPress={() => setPagos((a) => a.filter((_, j) => j !== i))}
                        accessibilityLabel="Quitar este pago"
                        style={c.quitar}
                      >
                        <Text style={c.quitarTexto}>Quitar</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
                <View style={s.rule} />
                <View style={s.rowBetween}>
                  <Text style={s.label}>Falta</Text>
                  <Text style={s.price}>{formatPrice(resumen.dueCents, true)}</Text>
                </View>
              </View>
            ) : null}

            {resumen.dueCents > 0 ? (
              <>
                <View style={c.medios}>
                  {MEDIOS.map((m) => (
                    <Pressable
                      key={m.key}
                      onPress={() => {
                        setMedio(m.key)
                        setRecibido('')
                        setReferencia('')
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: medio === m.key }}
                      style={[c.medio, medio === m.key && c.medioActivo]}
                    >
                      <Text style={medio === m.key ? s.labelStrong : s.label}>{m.label}</Text>
                    </Pressable>
                  ))}
                </View>

                {esEfectivo ? (
                  <View style={c.bloque}>
                    <View style={c.atajos}>
                      {atajos.map((cents) => (
                        <Pressable
                          key={cents}
                          onPress={() => setRecibido((cents / 100).toFixed(2))}
                          style={c.atajo}
                          accessibilityRole="button"
                        >
                          <Text style={s.body}>{formatPrice(cents)}</Text>
                        </Pressable>
                      ))}
                    </View>

                    <Field
                      label="Recibido"
                      value={recibido}
                      onChangeText={setRecibido}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      placeholder={(resumen.dueCents / 100).toFixed(2)}
                    />

                    {recibidoCents != null && recibidoCents > resumen.dueCents ? (
                      <View style={c.cambio}>
                        <Text style={s.label}>Cambio</Text>
                        <Text style={s.priceDisplay}>
                          {formatPrice(recibidoCents - resumen.dueCents, true)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <View style={c.bloque}>
                    <View style={s.rowBetween}>
                      <Text style={s.bodyMuted}>Importe</Text>
                      <Text style={s.price}>{formatPrice(resumen.dueCents, true)}</Text>
                    </View>
                    <Field
                      label="Referencia (opcional)"
                      value={referencia}
                      onChangeText={setReferencia}
                      autoCapitalize="characters"
                      placeholder={medio === 'card' ? 'Autorización' : 'Folio'}
                    />
                  </View>
                )}

                {/* Solo se ofrece partir el pago cuando el medio actual no
                    cubre el total: en una venta normal el botón no aparece y
                    no hay nada que decidir. */}
                {esEfectivo && recibidoCents != null && recibidoCents < resumen.dueCents ? (
                  <Button
                    label={`Añadir ${formatPrice(recibidoCents, true)} y pagar el resto con otro medio`}
                    variant="outline"
                    onPress={añadirPago}
                  />
                ) : null}
              </>
            ) : null}

            {error ? (
              <View style={c.error}>
                <Text style={s.body}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={c.pie}>
            <Button
              label={enviando ? 'Registrando…' : 'Cobrar y registrar'}
              size="charge"
              fullWidth
              loading={enviando}
              disabled={!resumen.isSettled && !puedeAñadir}
              onPress={() => void cobrar()}
            />
          </View>
        </View>
      </View>
    </Modal>
  )
}

const c = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(10,10,10,0.45)' },
  hoja: {
    maxHeight: '88%',
    backgroundColor: color['paper-bright'],
    borderTopWidth: size.border,
    borderTopColor: color.primary,
  },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: space.edge,
    borderBottomWidth: 1,
    borderBottomColor: color['surface-variant'],
  },
  cuerpo: { padding: space.edge, gap: space.gutter },
  bloque: { gap: space.gap },
  medios: { flexDirection: 'row', gap: space.gap },
  medio: {
    flex: 1,
    minHeight: size.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color['surface-variant'],
  },
  medioActivo: { borderWidth: size.border, borderColor: color.primary },
  atajos: { flexDirection: 'row', gap: space.gap, flexWrap: 'wrap' },
  atajo: {
    minHeight: size.touchMin,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.gutter,
    borderWidth: 1,
    borderColor: color['outline-variant'],
  },
  cambio: {
    borderWidth: size.border,
    borderColor: color.primary,
    padding: space.gutter,
    alignItems: 'center',
  },
  quitar: { marginLeft: space.gutter },
  quitarTexto: { ...text.labelUpper, fontSize: 10, color: color['text-muted'] },
  error: { borderWidth: 1, borderColor: color.primary, padding: space.gutter },
  pie: {
    padding: space.edge,
    borderTopWidth: 1,
    borderTopColor: color['surface-variant'],
  },
})
