import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { formatPrice, parseAmountToCents } from '@lumane/core'

import { useSession, useStaff } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { Button } from '@/ui/Button'
import { Field } from '@/ui/Field'
import { color, s, size, space, text } from '@/theme'

/**
 * Caja.
 *
 * Tres momentos del día: se abre con un fondo, se le mete y se le saca dinero
 * durante la jornada, y se cierra contando lo que hay.
 *
 * El corte NO se calcula aquí. `close_register` compara lo contado con lo que
 * la base sabe que debería haber y congela el resultado. Si el cálculo viviera
 * en la tablet, dos versiones del APK podrían cuadrar la caja de dos formas
 * distintas — y la diferencia se descubriría meses después, en la contabilidad.
 */

interface Resumen {
  session: {
    id: string
    opened_at: string
    opening_float_cents: number
    status: 'open' | 'closed'
    counted_cash_cents: number | null
    difference_cents: number | null
  }
  expected_cash_cents: number
  by_method: Record<string, { amount_cents: number; count: number }>
  sales_count: number
  sales_total_cents: number
  cash_in_cents: number
  cash_out_cents: number
}

const NOMBRE_MEDIO: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  stripe: 'Tarjeta (en línea)',
  store_credit: 'Saldo a favor',
}

export default function Caja() {
  const staff = useStaff()
  const { refresh, can } = useSession()

  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const [fondo, setFondo] = useState('')
  const [contado, setContado] = useState('')
  const [movImporte, setMovImporte] = useState('')
  const [movMotivo, setMovMotivo] = useState('')

  const hayTurno = staff.open_session !== null

  const cargar = useCallback(async () => {
    if (!hayTurno) {
      setResumen(null)
      setCargando(false)
      return
    }

    const { data, error: fallo } = await supabase.rpc('get_register_summary', {})
    setCargando(false)
    if (fallo) {
      setError(fallo.message)
      return
    }
    setError(null)
    setResumen(data as unknown as Resumen)
  }, [hayTurno])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function llamar(fn: 'open_register' | 'add_cash_movement' | 'close_register', args: object) {
    setOcupado(true)
    setError(null)
    const { error: fallo } = await supabase.rpc(fn, args as never)
    setOcupado(false)

    if (fallo) {
      setError(fallo.message)
      return false
    }

    // El turno abierto vive en el perfil, del que depende la pantalla de venta
    // para dejar cobrar. Releerlo aquí evita que la cajera abra la caja y la
    // venta siga diciendo que no hay turno.
    await refresh()
    await cargar()
    return true
  }

  if (cargando) {
    return (
      <View style={[s.screen, s.center]}>
        <ActivityIndicator color={color.primary} size="large" />
      </View>
    )
  }

  // ---- Sin turno: solo se puede abrir -------------------------------------
  if (!hayTurno || !resumen) {
    return (
      <ScrollView contentContainerStyle={k.centro} keyboardShouldPersistTaps="handled">
        <View style={k.tarjeta}>
          <Text style={s.label}>Caja cerrada</Text>
          <Text style={[s.headlineLg, k.titulo]}>Abrir el día</Text>
          <Text style={s.bodyMuted}>
            Cuenta el dinero con el que empieza la caja. Ese fondo es el punto de partida del corte
            de esta noche.
          </Text>

          <View style={k.espacio} />
          <Field
            label="Fondo inicial"
            value={fondo}
            onChangeText={setFondo}
            keyboardType="decimal-pad"
            inputMode="decimal"
            placeholder="0.00"
            error={error}
          />
          <View style={k.espacio} />
          <Button
            label="Abrir caja"
            size="lg"
            fullWidth
            loading={ocupado}
            onPress={() =>
              void llamar('open_register', {
                p_opening_float_cents: parseAmountToCents(fondo) ?? 0,
              })
            }
          />
        </View>
      </ScrollView>
    )
  }

  // ---- Turno abierto -------------------------------------------------------
  const contadoCents = parseAmountToCents(contado)
  const diferencia = contadoCents == null ? null : contadoCents - resumen.expected_cash_cents

  return (
    <ScrollView contentContainerStyle={k.cuerpo} keyboardShouldPersistTaps="handled">
      <View style={k.columna}>
        <View style={k.tarjeta}>
          <Text style={s.label}>Turno abierto</Text>
          <Text style={[s.headlineMd, k.titulo]}>
            Desde{' '}
            {new Date(resumen.session.opened_at).toLocaleTimeString('es-MX', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>

          <Linea etiqueta="Fondo inicial" valor={resumen.session.opening_float_cents} />
          <Linea etiqueta="Entradas" valor={resumen.cash_in_cents} />
          <Linea etiqueta="Salidas" valor={-resumen.cash_out_cents} />
          <View style={s.rule} />
          <Linea etiqueta="Efectivo esperado" valor={resumen.expected_cash_cents} fuerte />

          <View style={k.espacio} />
          <Text style={s.label}>Ventas del turno</Text>
          <Linea
            etiqueta={`${resumen.sales_count} ${resumen.sales_count === 1 ? 'venta' : 'ventas'}`}
            valor={resumen.sales_total_cents}
          />
          {Object.entries(resumen.by_method).map(([metodo, dato]) => (
            <Linea
              key={metodo}
              etiqueta={`  ${NOMBRE_MEDIO[metodo] ?? metodo} (${dato.count})`}
              valor={dato.amount_cents}
            />
          ))}
        </View>

        {can('register.movement') ? (
          <View style={k.tarjeta}>
            <Text style={s.label}>Entrada o salida de efectivo</Text>
            <Text style={[s.bodyMuted, k.nota]}>
              Para pagos a proveedores, cambio que se trae del banco o cualquier movimiento que no
              sea una venta.
            </Text>

            <Field
              label="Importe"
              value={movImporte}
              onChangeText={setMovImporte}
              keyboardType="decimal-pad"
              inputMode="decimal"
              placeholder="0.00"
            />
            <View style={k.espacio} />
            <Field
              label="Motivo"
              value={movMotivo}
              onChangeText={setMovMotivo}
              placeholder="Pago de mensajería"
            />
            <View style={k.espacio} />

            <View style={k.dos}>
              <View style={s.fill}>
                <Button
                  label="Entra"
                  variant="outline"
                  fullWidth
                  disabled={ocupado || !parseAmountToCents(movImporte) || !movMotivo.trim()}
                  onPress={async () => {
                    const ok = await llamar('add_cash_movement', {
                      p_direction: 'in',
                      p_amount_cents: parseAmountToCents(movImporte) ?? 0,
                      p_reason: movMotivo.trim(),
                    })
                    if (ok) {
                      setMovImporte('')
                      setMovMotivo('')
                    }
                  }}
                />
              </View>
              <View style={s.fill}>
                <Button
                  label="Sale"
                  variant="outline"
                  fullWidth
                  disabled={ocupado || !parseAmountToCents(movImporte) || !movMotivo.trim()}
                  onPress={async () => {
                    const ok = await llamar('add_cash_movement', {
                      p_direction: 'out',
                      p_amount_cents: parseAmountToCents(movImporte) ?? 0,
                      p_reason: movMotivo.trim(),
                    })
                    if (ok) {
                      setMovImporte('')
                      setMovMotivo('')
                    }
                  }}
                />
              </View>
            </View>
          </View>
        ) : null}
      </View>

      {can('register.close') ? (
        <View style={k.columna}>
          <View style={k.tarjeta}>
            <Text style={s.label}>Cerrar el día</Text>
            <Text style={[s.headlineMd, k.titulo]}>Corte de caja</Text>
            <Text style={s.bodyMuted}>
              Cuenta el efectivo del cajón e introdúcelo aquí. El sistema compara con lo que debería
              haber y guarda la diferencia, cuadre o no.
            </Text>

            <View style={k.espacio} />
            <Field
              label="Efectivo contado"
              value={contado}
              onChangeText={setContado}
              keyboardType="decimal-pad"
              inputMode="decimal"
              placeholder={(resumen.expected_cash_cents / 100).toFixed(2)}
              error={error}
            />

            {/* La diferencia se anticipa ANTES de cerrar. Descubrir un faltante
                de $200 cuando el turno ya está congelado no deja margen para
                volver a contar. */}
            {diferencia !== null ? (
              <View style={[k.diferencia, diferencia !== 0 && k.diferenciaMarcada]}>
                <Text style={s.label}>
                  {diferencia === 0 ? 'Cuadra' : diferencia > 0 ? 'Sobra' : 'Falta'}
                </Text>
                <Text style={s.priceDisplay}>{formatPrice(Math.abs(diferencia), true)}</Text>
              </View>
            ) : null}

            <View style={k.espacio} />
            <Button
              label="Cerrar caja"
              size="lg"
              variant="danger"
              fullWidth
              loading={ocupado}
              disabled={contadoCents == null}
              onPress={() =>
                void llamar('close_register', { p_counted_cash_cents: contadoCents ?? 0 })
              }
            />
          </View>
        </View>
      ) : null}
    </ScrollView>
  )
}

function Linea({
  etiqueta,
  valor,
  fuerte = false,
}: {
  etiqueta: string
  valor: number
  fuerte?: boolean
}) {
  return (
    <View style={k.linea}>
      <Text style={fuerte ? s.labelStrong : s.bodyMuted}>{etiqueta}</Text>
      <Text style={s.price}>{formatPrice(valor, true)}</Text>
    </View>
  )
}

const k = StyleSheet.create({
  centro: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: space.edge },
  cuerpo: { flexDirection: 'row', gap: space.gutter, padding: space.edge },
  columna: { flex: 1, gap: space.gutter },
  tarjeta: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: color['paper-bright'],
    borderWidth: 1,
    borderColor: color.primary,
    padding: space.edge,
  },
  titulo: { marginTop: 4, marginBottom: space.gap },
  nota: { fontSize: 13, marginBottom: space.gap },
  espacio: { height: space.gutter },
  dos: { flexDirection: 'row', gap: space.gap },
  linea: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  diferencia: {
    marginTop: space.gutter,
    padding: space.gutter,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: color['surface-variant'],
  },
  // Una diferencia se marca engordando el borde, no con color: el sistema es
  // monocromo y un rojo aquí sería el único del proyecto.
  diferenciaMarcada: { borderWidth: size.border, borderColor: color.primary },
  texto: text.bodyMd,
})
