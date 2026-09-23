import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { randomUUID } from 'expo-crypto'
import { formatPrice } from '@lumane/core'
import { errorMessage } from '@lumane/db'

import { supabase } from '@/lib/supabase'
import { Field } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { color, s, size, space, text } from '@/theme'

/**
 * Devolver piezas de una venta.
 *
 * Toda la lógica está en `pos_create_return` desde la Fase 0 y nadie la había
 * llamado nunca: comprueba el permiso, reintegra inventario, impide devolver
 * más de lo vendido sumando devoluciones previas, y deja un **pago negativo**
 * para que el corte de caja cuadre solo, sin aritmética especial.
 *
 * Esta hoja solo tiene que recoger bien tres decisiones: qué piezas, si vuelven
 * al inventario, y por dónde sale el dinero.
 *
 * El tope por línea lo pinta la interfaz a partir de `returned`, que ya viene
 * en `get_staff_order`. **No es la defensa**: el RPC vuelve a comprobarlo. Es
 * para que la cajera no teclee un número que va a ser rechazado con la clienta
 * delante.
 */

const MEDIOS = [
  { key: 'cash', label: 'Efectivo' },
  { key: 'card', label: 'Tarjeta' },
  { key: 'transfer', label: 'Transferencia' },
  { key: 'store_credit', label: 'Saldo a favor' },
] as const

type Medio = (typeof MEDIOS)[number]['key']

interface LineaVenta {
  id: string
  product_name: string
  variant_title: string | null
  quantity: number
  total_cents: number
}

export function ReturnSheet({
  orderId,
  onClose,
  onHecha,
}: {
  orderId: string
  onClose: () => void
  onHecha: () => void
}) {
  const [lineas, setLineas] = useState<LineaVenta[]>([])
  const [devueltas, setDevueltas] = useState<Record<string, number>>({})
  const [folio, setFolio] = useState('')
  const [cargando, setCargando] = useState(true)

  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [motivo, setMotivo] = useState('')
  const [restock, setRestock] = useState(true)
  const [medio, setMedio] = useState<Medio>('cash')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // El identificador se genera UNA vez y sobrevive a los reintentos: si la
  // tablet pierde el wifi al confirmar y se vuelve a pulsar, `pos_create_return`
  // reconoce el uuid y devuelve la devolución original en lugar de hacer otra.
  const [clientUuid] = useState(() => randomUUID())

  useEffect(() => {
    void (async () => {
      const { data, error: fallo } = await supabase.rpc('get_staff_order', { p_order_id: orderId })
      setCargando(false)
      if (fallo) {
        setError(errorMessage(fallo))
        return
      }
      const ficha = data as unknown as {
        order: { order_number: string }
        lines: LineaVenta[]
        returned: Record<string, number>
      }
      setLineas(ficha.lines)
      setDevueltas(ficha.returned ?? {})
      setFolio(ficha.order.order_number)
    })()
  }, [orderId])

  const disponible = useCallback(
    (l: LineaVenta) => l.quantity - (devueltas[l.id] ?? 0),
    [devueltas],
  )

  const total = useMemo(
    () =>
      lineas.reduce((suma, l) => {
        const n = cantidades[l.id] ?? 0
        if (n === 0) return suma
        // El mismo prorrateo que hace el RPC: el precio realmente pagado por
        // pieza, con su descuento repartido. Es solo una previsualización — el
        // importe que se devuelve lo calcula la base.
        return suma + Math.round(l.total_cents / l.quantity) * n
      }, 0),
    [lineas, cantidades],
  )

  const hayAlgo = total > 0

  function ajustar(l: LineaVenta, delta: number) {
    setError(null)
    setCantidades((prev) => {
      const actual = prev[l.id] ?? 0
      const nuevo = Math.max(0, Math.min(actual + delta, disponible(l)))
      return { ...prev, [l.id]: nuevo }
    })
  }

  async function devolver() {
    if (!hayAlgo) {
      setError('Elige al menos una pieza para devolver')
      return
    }
    setEnviando(true)
    setError(null)

    const { error: fallo } = await supabase.rpc('pos_create_return', {
      p_payload: {
        client_uuid: clientUuid,
        order_id: orderId,
        reason: motivo.trim() || null,
        restock,
        refund_method: medio,
        lines: Object.entries(cantidades)
          .filter(([, n]) => n > 0)
          .map(([order_line_id, quantity]) => ({ order_line_id, quantity })),
      },
    })

    setEnviando(false)
    if (fallo) {
      setError(errorMessage(fallo))
      return
    }
    onHecha()
    onClose()
  }

  return (
    <Sheet
      eyebrow={folio ? `Devolver de ${folio}` : 'Devolver'}
      title={hayAlgo ? formatPrice(total, true) : 'Elige las piezas'}
      titleIsMoney={hayAlgo}
      onClose={onClose}
      action={{
        label: enviando ? 'Registrando…' : 'Registrar devolución',
        onPress: () => void devolver(),
        loading: enviando,
        disabled: !hayAlgo,
      }}
      error={error}
    >
      {cargando ? <Text style={s.bodyMuted}>Abriendo la venta…</Text> : null}

      {lineas.map((l) => {
        const libre = disponible(l)
        const n = cantidades[l.id] ?? 0
        const yaDevueltas = devueltas[l.id] ?? 0

        return (
          <View key={l.id} style={r.linea}>
            <View style={s.fill}>
              <Text style={s.body}>
                {l.product_name}
                {l.variant_title ? <Text style={s.bodyMuted}>{` · ${l.variant_title}`}</Text> : null}
              </Text>
              <Text style={r.meta}>
                {libre === 0
                  ? `Ya se devolvieron las ${l.quantity}`
                  : yaDevueltas > 0
                    ? `Quedan ${libre} de ${l.quantity} · ${yaDevueltas} devuelta${yaDevueltas === 1 ? '' : 's'}`
                    : `${l.quantity} vendida${l.quantity === 1 ? '' : 's'}`}
              </Text>
            </View>

            {libre > 0 ? (
              <View style={r.paso}>
                <Pressable
                  onPress={() => ajustar(l, -1)}
                  disabled={n === 0}
                  accessibilityLabel={`Quitar una de ${l.product_name}`}
                  style={({ pressed }) => [r.boton, pressed && r.botonPulsado, n === 0 && r.inerte]}
                >
                  <Text style={r.signo}>−</Text>
                </Pressable>
                <Text style={r.cantidad}>{n}</Text>
                <Pressable
                  onPress={() => ajustar(l, 1)}
                  disabled={n >= libre}
                  accessibilityLabel={`Añadir una de ${l.product_name}`}
                  style={({ pressed }) => [
                    r.boton,
                    pressed && r.botonPulsado,
                    n >= libre && r.inerte,
                  ]}
                >
                  <Text style={r.signo}>+</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        )
      })}

      {/* ---- ¿Vuelven al inventario? ---- */}
      <Pressable
        onPress={() => setRestock((v) => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: restock }}
        style={r.opcion}
      >
        <View style={[r.casilla, restock && r.casillaMarcada]}>
          {restock ? <Text style={r.palomita}>✓</Text> : null}
        </View>
        <View style={s.fill}>
          <Text style={s.body}>Vuelven al inventario</Text>
          <Text style={r.meta}>
            Desmárcalo solo si la prenda viene dañada y no se puede volver a vender.
          </Text>
        </View>
      </Pressable>

      {/* ---- Por dónde sale el dinero ---- */}
      <View>
        <Text style={s.label}>Reembolso</Text>
        <View style={r.medios}>
          {MEDIOS.map((m) => (
            <Pressable
              key={m.key}
              onPress={() => setMedio(m.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: medio === m.key }}
              style={[r.medio, medio === m.key && r.medioActivo]}
            >
              <Text style={medio === m.key ? s.labelStrong : s.label}>{m.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Field
        label="Motivo"
        value={motivo}
        onChangeText={setMotivo}
        editable={!enviando}
        hint="Queda guardado en la devolución. Ayuda a saber qué se devuelve y por qué."
      />
    </Sheet>
  )
}

const r = StyleSheet.create({
  linea: { flexDirection: 'row', alignItems: 'center', gap: space.gutter },
  meta: { ...text.bodyMd, fontSize: 12, color: color['text-muted'] },
  paso: { flexDirection: 'row', alignItems: 'center', gap: space.gap },
  boton: {
    width: size.touchMin,
    height: size.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color['outline-variant'],
  },
  botonPulsado: { backgroundColor: color['vellum-neutral'] },
  inerte: { opacity: 0.35 },
  signo: { ...text.headlineSm, color: color.primary },
  cantidad: { ...text.headlineSm, color: color.primary, minWidth: 28, textAlign: 'center' },
  opcion: { flexDirection: 'row', alignItems: 'flex-start', gap: space.gap, minHeight: 44 },
  casilla: {
    width: 26,
    height: 26,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: size.border,
    borderColor: color.primary,
  },
  casillaMarcada: { backgroundColor: color.primary },
  palomita: { color: color['on-primary'], fontSize: 16, lineHeight: 18 },
  medios: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gap, marginTop: 6 },
  medio: {
    minHeight: 44,
    paddingHorizontal: space.gutter,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color['outline-variant'],
  },
  medioActivo: { borderWidth: size.border, borderColor: color.primary },
})
