import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { formatPrice } from '@lumane/core'
import { errorMessage } from '@lumane/db'

import { supabase } from '@/lib/supabase'
import { Sheet } from '@/ui/Sheet'
import { color, s, space, text } from '@/theme'

/**
 * La ficha de una clienta.
 *
 * Lo primero es cuánto ha comprado y cuándo fue la última vez: es lo que
 * cambia cómo se la atiende. El resto —sus compras, sus direcciones, lo que
 * guardó como favorito— viene debajo, para cuando pregunta por algo concreto.
 *
 * Las favoritas son de solo lectura. Qué le gusta a alguien es suyo: el
 * mostrador lo consulta para atenderla mejor, no para editarlo. La política
 * de la migración 0056 lo impone también en la base.
 */

interface Ficha {
  customer: {
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
    phone: string | null
    notes: string | null
    accepts_marketing: boolean
    created_via: string
  }
  stats: { orders_count: number; total_spent_cents: number; last_order_at: string | null } | null
  recent_orders: {
    id: string
    order_number: string
    channel: string
    status: string
    total_cents: number
    placed_at: string | null
  }[]
  addresses: Record<string, unknown>[]
  favorites: { product_id: string; name: string }[]
}

function fecha(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Mazatlan',
  }).format(new Date(iso))
}

export function CustomerSheet({
  customerId,
  onClose,
  onElegir,
}: {
  customerId: string
  onClose: () => void
  /** Si viene, la hoja ofrece asociarla a la venta en curso. */
  onElegir?: (id: string, nombre: string, email: string | null) => void
}) {
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const { data, error: fallo } = await supabase.rpc('get_customer_profile', {
      p_customer_id: customerId,
    })
    setCargando(false)
    if (fallo) {
      setError(errorMessage(fallo))
      return
    }
    setFicha(data as unknown as Ficha)
  }, [customerId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const nombre = ficha
    ? [ficha.customer.first_name, ficha.customer.last_name].filter(Boolean).join(' ') || 'Clienta'
    : ''

  return (
    <Sheet
      eyebrow="Clienta"
      title={cargando ? 'Abriendo…' : nombre}
      onClose={onClose}
      error={error}
      action={
        ficha && onElegir
          ? {
              label: 'Asociar a esta venta',
              onPress: () => {
                onElegir(ficha.customer.id, nombre, ficha.customer.email)
                onClose()
              },
            }
          : undefined
      }
    >
      {ficha ? (
        <>
          <View style={c.bloque}>
            {ficha.customer.phone ? <Dato etiqueta="Teléfono" valor={ficha.customer.phone} /> : null}
            {ficha.customer.email ? <Dato etiqueta="Correo" valor={ficha.customer.email} /> : null}
            <Dato
              etiqueta="Alta"
              valor={ficha.customer.created_via === 'pos' ? 'En el mostrador' : 'En la tienda en línea'}
            />
          </View>

          <View style={c.resumen}>
            <View style={c.cifra}>
              <Text style={s.priceDisplay}>{ficha.stats?.orders_count ?? 0}</Text>
              <Text style={s.label}>
                {(ficha.stats?.orders_count ?? 0) === 1 ? 'compra' : 'compras'}
              </Text>
            </View>
            <View style={c.cifra}>
              <Text style={s.price}>{formatPrice(ficha.stats?.total_spent_cents ?? 0)}</Text>
              <Text style={s.label}>en total</Text>
            </View>
            <View style={c.cifra}>
              <Text style={s.body}>{fecha(ficha.stats?.last_order_at ?? null)}</Text>
              <Text style={s.label}>última vez</Text>
            </View>
          </View>

          {ficha.recent_orders.length > 0 ? (
            <View style={c.bloque}>
              <Text style={s.label}>Sus compras</Text>
              {ficha.recent_orders.map((o) => (
                <View key={o.id} style={s.rowBetween}>
                  <View style={s.fill}>
                    <Text style={s.body}>{o.order_number}</Text>
                    <Text style={c.meta}>
                      {`${fecha(o.placed_at)} · ${o.channel === 'pos' ? 'mostrador' : 'en línea'}`}
                    </Text>
                  </View>
                  <Text style={s.price}>{formatPrice(o.total_cents, true)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={s.bodyMuted}>Todavía no ha comprado nada.</Text>
          )}

          {ficha.favorites.length > 0 ? (
            <View style={c.bloque}>
              <Text style={s.label}>Le gustaron</Text>
              {ficha.favorites.map((f) => (
                <Text key={f.product_id} style={s.body}>
                  {f.name}
                </Text>
              ))}
            </View>
          ) : null}

          {ficha.customer.notes ? (
            <View style={c.bloque}>
              <Text style={s.label}>Nota</Text>
              <Text style={s.body}>{ficha.customer.notes}</Text>
            </View>
          ) : null}
        </>
      ) : (
        <View />
      )}
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

const c = StyleSheet.create({
  bloque: { gap: 4 },
  resumen: {
    flexDirection: 'row',
    gap: space.gutter,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: color['surface-variant'],
    paddingVertical: space.gutter,
  },
  cifra: { flex: 1, gap: 2 },
  meta: { ...text.bodyMd, fontSize: 12, color: color['text-muted'] },
})
