import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
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
import { Sheet } from '@/ui/Sheet'
import { Teclado } from '@/ui/Teclado'
import { CustomerPicker } from '@/features/customers/CustomerPicker'
import { color, s, size, space, text } from '@/theme'

/**
 * El cobro.
 *
 * Se abre encima de la venta y no en otra pantalla: la cajera tiene que poder
 * ver lo que está cobrando mientras cuenta el dinero, y volver atrás sin
 * perder el carrito.
 *
 * Dos columnas: a la izquierda qué se está cobrando (clienta, medio, pagos ya
 * puestos, lo que falta, el cambio); a la derecha el importe y un teclado
 * numérico propio. El teclado del sistema no aparece: en horizontal tapaba
 * media hoja y escondía el botón de cobrar.
 *
 * El caso normal —un medio, importe exacto— sigue siendo de un toque: con el
 * campo vacío se cobra justo lo que falta. Los pagos mixtos («$500 en
 * efectivo y el resto con tarjeta») se arman tecleando una parte y pulsando
 * «Agregar pago»; lo que falta se recalcula y se cobra el resto con otro
 * medio.
 *
 * Nada de lo que se calcula aquí decide el importe. `pos_create_sale` recalcula
 * el total contra la base y ABORTA si los pagos no lo cubren exactamente.
 */

const MEDIOS: { key: PaymentMethod; label: string; en: string }[] = [
  { key: 'cash', label: 'Efectivo', en: 'en efectivo' },
  { key: 'card', label: 'Tarjeta', en: 'con tarjeta' },
  { key: 'transfer', label: 'Transferencia', en: 'por transferencia' },
]

const nombreMedio = (m: PaymentMethod) => MEDIOS.find((x) => x.key === m)?.label ?? m

interface Props {
  carrito: ReturnType<typeof useSaleCart>
  onCancelar: () => void
  /** El cambio lo da la BASE, no el cálculo del cliente: es el que se entrega. */
  onCobrada: (orderNumber: string, orderId: string, changeCents: number) => void
}

export function ChargeSheet({ carrito, onCancelar, onCobrada }: Props) {
  const total = carrito.totals.totalCents

  const [pagos, setPagos] = useState<DraftPayment[]>([])
  const [medio, setMedio] = useState<PaymentMethod>('cash')
  /** Lo tecleado. Vacío = justo lo que falta. */
  const [monto, setMonto] = useState('')
  const [referencia, setReferencia] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [eligiendoClienta, setEligiendoClienta] = useState(false)

  const resumen = useMemo(() => summarizePayments(pagos, total), [pagos, total])
  const falta = resumen.dueCents
  const atajos = useMemo(() => cashShortcuts(falta), [falta])

  const esEfectivo = medio === 'cash'
  const tecleado = parseAmountToCents(monto)
  /** Lo que la cajera dice que se paga con este medio; vacío = lo que falta. */
  const importe = tecleado ?? falta

  // En efectivo se puede entregar de más (hay cambio). Con tarjeta o
  // transferencia no: la terminal cobra lo exacto y un «de más» abriría un
  // agujero en el corte.
  const excedeSinCambio = !esEfectivo && importe > falta
  const aporte = Math.min(importe, falta)
  const cambio = esEfectivo ? Math.max(0, importe - falta) : 0
  const cubre = falta > 0 && aporte === falta && !excedeSinCambio
  const parcial = aporte > 0 && aporte < falta

  function pagoActual(): DraftPayment {
    return esEfectivo
      ? { method: 'cash', amountCents: aporte, tenderedCents: importe }
      : {
          method: medio,
          amountCents: aporte,
          ...(referencia.trim() ? { reference: referencia.trim() } : {}),
        }
  }

  function agregarPago() {
    if (!parcial) return
    setPagos((actuales) => [...actuales, pagoActual()])
    setMonto('')
    setReferencia('')
    setError(null)
    // Lo normal tras una parte en efectivo es el resto con tarjeta, y al revés.
    setMedio(esEfectivo ? 'card' : 'cash')
  }

  async function cobrar() {
    if (excedeSinCambio) {
      setError(`Con ${nombreMedio(medio).toLowerCase()} no se puede cobrar más de lo que falta`)
      return
    }

    // El último pago se compone sin obligar a pulsar «Agregar»: en la venta de
    // un solo medio, ese toque extra no aporta nada.
    const definitivos = resumen.isSettled ? pagos : [...pagos, pagoActual()]

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

    const venta = data as unknown as {
      order: { id: string; order_number: string }
      change_cents: number | string | null
    }
    onCobrada(venta.order.order_number, venta.order.id, Number(venta.change_cents ?? 0))
  }

  return (
    <Sheet
      eyebrow="Cobrar"
      title={formatPrice(total, true)}
      titleIsMoney
      onClose={onCancelar}
      error={error}
      action={{
        label: enviando
          ? 'Registrando…'
          : cambio > 0
            ? `Cobrar · cambio ${formatPrice(cambio, true)}`
            : 'Cobrar y registrar',
        onPress: () => void cobrar(),
        loading: enviando,
        disabled: !(resumen.isSettled || cubre),
      }}
    >
      <View style={c.columnas}>
        {/* ---------------- Qué se cobra ---------------- */}
        <View style={c.columna}>
          {/* La clienta es opcional. Asociarla sirve para el ticket por correo
              y su historial; el 90 % de las ventas no la lleva. */}
          <Pressable
            onPress={() => setEligiendoClienta(true)}
            accessibilityRole="button"
            accessibilityLabel={
              carrito.customer ? `Cambiar de clienta, ahora ${carrito.customer.nombre}` : 'Asociar una clienta'
            }
            style={({ pressed }) => [c.clienta, pressed && c.clientaPulsada]}
          >
            <View style={s.fill}>
              <Text style={s.label}>Clienta</Text>
              <Text style={carrito.customer ? s.body : s.bodyMuted} numberOfLines={1}>
                {carrito.customer ? carrito.customer.nombre : 'Sin asociar'}
              </Text>
            </View>
            <Text style={s.label}>{carrito.customer ? 'Cambiar' : 'Buscar'}</Text>
          </Pressable>

          {falta > 0 ? (
            <View style={c.medios}>
              {MEDIOS.map((m) => (
                <Pressable
                  key={m.key}
                  onPress={() => {
                    setMedio(m.key)
                    setMonto('')
                    setReferencia('')
                    setError(null)
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: medio === m.key }}
                  style={[c.medio, medio === m.key && c.medioActivo]}
                >
                  <Text style={medio === m.key ? s.labelStrong : s.label}>{m.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {pagos.length > 0 ? (
            <View style={c.pagos}>
              <Text style={s.label}>Pagos</Text>
              {pagos.map((p, i) => (
                <View key={`${p.method}-${i}`} style={c.pago}>
                  <Text style={[s.body, s.fill]}>
                    {nombreMedio(p.method)}
                    {p.reference ? <Text style={s.bodyMuted}>{` · ${p.reference}`}</Text> : null}
                  </Text>
                  <Text style={s.price}>{formatPrice(p.amountCents, true)}</Text>
                  <Pressable
                    onPress={() => setPagos((a) => a.filter((_, j) => j !== i))}
                    accessibilityLabel="Quitar este pago"
                    style={c.quitar}
                  >
                    <Text style={c.quitarTexto}>Quitar</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          <View style={c.falta}>
            <Text style={s.label}>{falta > 0 ? 'Falta' : 'Cubierto'}</Text>
            <Text style={s.priceDisplay}>{formatPrice(falta, true)}</Text>
          </View>

          {cambio > 0 ? (
            <View style={c.cambio}>
              <Text style={s.label}>Cambio</Text>
              <Text style={s.priceDisplay}>{formatPrice(cambio, true)}</Text>
            </View>
          ) : null}

          {/* Solo con tarjeta o transferencia, y opcional. Es el único campo
              que abre el teclado del sistema: un folio puede llevar letras. */}
          {falta > 0 && !esEfectivo ? (
            <Field
              label="Referencia (opcional)"
              value={referencia}
              onChangeText={setReferencia}
              autoCapitalize="characters"
              placeholder={medio === 'card' ? 'Autorización' : 'Folio'}
            />
          ) : null}
        </View>

        {/* ---------------- Importe y teclado ---------------- */}
        {falta > 0 ? (
          <View style={c.columna}>
            <View style={[c.pantalla, excedeSinCambio && c.pantallaError]}>
              <Text style={s.label}>
                {esEfectivo ? 'Recibido' : `Importe ${MEDIOS.find((m) => m.key === medio)?.en}`}
              </Text>
              <Text
                style={[s.priceDisplay, monto === '' && c.sugerido]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {monto === '' ? formatPrice(falta, true) : `$ ${monto}`}
              </Text>
              {excedeSinCambio ? (
                <Text style={c.aviso}>No puede ser más de lo que falta</Text>
              ) : monto === '' ? (
                <Text style={c.aviso}>Vacío = justo lo que falta</Text>
              ) : null}
            </View>

            {esEfectivo ? (
              <View style={c.atajos}>
                {atajos.map((cents) => (
                  <Pressable
                    key={cents}
                    onPress={() => setMonto(String(cents / 100))}
                    style={({ pressed }) => [c.atajo, pressed && c.clientaPulsada]}
                    accessibilityRole="button"
                  >
                    <Text style={s.body}>{formatPrice(cents)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <Teclado valor={monto} onCambio={setMonto} />

            {/* Solo cuando lo tecleado no cubre lo que falta: en una venta
                normal este botón no aparece y no hay nada que decidir. */}
            {parcial ? (
              <Button
                label={`Agregar ${formatPrice(aporte, true)} ${MEDIOS.find((m) => m.key === medio)?.en} y cobrar el resto aparte`}
                variant="outline"
                fullWidth
                onPress={agregarPago}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      {eligiendoClienta ? (
        <CustomerPicker
          onClose={() => setEligiendoClienta(false)}
          onElegida={(id, nombre, email) => carrito.setCustomer({ id, nombre, email })}
        />
      ) : null}
    </Sheet>
  )
}

const c = StyleSheet.create({
  columnas: { flexDirection: 'row', gap: space.edge, alignItems: 'flex-start' },
  columna: { flex: 1, gap: space.gap },
  clienta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gutter,
    minHeight: size.touchMin,
    paddingHorizontal: space.gutter,
    borderWidth: 1,
    borderColor: color['outline-variant'],
  },
  clientaPulsada: { backgroundColor: color['vellum-neutral'] },
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
  pagos: { gap: 4 },
  pago: { flexDirection: 'row', alignItems: 'center', gap: space.gap, minHeight: 40 },
  falta: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: color.primary,
    paddingTop: space.gap,
  },
  cambio: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    borderWidth: size.border,
    borderColor: color.primary,
    padding: space.gap,
  },
  pantalla: {
    borderBottomWidth: size.border,
    borderBottomColor: color.primary,
    paddingBottom: space.gap,
    alignItems: 'flex-end',
  },
  pantallaError: { borderBottomColor: color.primary, borderBottomWidth: 4 },
  // Lo que se cobraría sin teclear nada, en gris: se ve que es una propuesta.
  sugerido: { color: color['outline-variant'] },
  aviso: { ...text.labelUpper, fontSize: 10, color: color['text-muted'] },
  atajos: { flexDirection: 'row', gap: space.gap },
  atajo: {
    flex: 1,
    minHeight: size.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color['outline-variant'],
  },
  quitar: { minHeight: 40, justifyContent: 'center', paddingLeft: space.gap },
  quitarTexto: { ...text.labelUpper, fontSize: 10, color: color['text-muted'] },
})
