import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { formatPrice } from '@lumane/core'
import { errorMessage } from '@lumane/db'

import { supabase } from '@/lib/supabase'
import { Chip } from '@/ui/Chip'
import { color, s, size, space, text } from '@/theme'

/**
 * Los reportes, en la tablet.
 *
 * El plan los puso en `/admin` porque son tablas densas que se leen sentada, y
 * ahí siguen: el panel enseña el desglose fiscal, lo más vendido y la serie
 * diaria completa. Esta pantalla es la versión de mostrador de la MISMA
 * función —`sales_report`—, no un cálculo paralelo.
 *
 * Lo que cambia es el recorte. Aquí se responde «cómo vamos» de un vistazo, de
 * pie y entre clientas: hoy, la semana, el mes; cuánto y cuántas ventas. El
 * detalle que se estudia con calma se queda en el navegador, donde además se
 * puede copiar y exportar.
 *
 * Reproducir aquí las nueve tablas del panel habría sido pedirle a alguien que
 * lea una hoja de cálculo en una tablet sobre el mostrador.
 */

type Rango = 'hoy' | 'semana' | 'mes'

interface Reporte {
  desde: string
  hasta: string
  resumen: {
    pedidos: number
    piezas: number
    bruto_cents: number
    neto_cents: number
    devoluciones_cents: number
    cobrado_cents: number
    ticket_promedio_cents: number
  }
  por_canal: { canal: string; pedidos: number; bruto_cents: number }[]
  por_metodo_pago: { metodo: string; cobros: number; cents: number }[]
  por_dia: { dia: string; pedidos: number; bruto_cents: number }[]
}

const CANALES: Record<string, string> = { pos: 'Mostrador', online: 'Tienda en línea' }

const METODOS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  stripe: 'Tarjeta en línea',
  store_credit: 'Saldo a favor',
}

/**
 * Los rangos se calculan con la fecha LOCAL de la tablet, que está en la
 * boutique y por tanto en su misma zona. Se mandan como `YYYY-MM-DD` y el RPC
 * los interpreta contra `locations.timezone`, así que «hoy» significa el día
 * de la tienda y no un tramo de UTC.
 *
 * `toISOString()` no sirve aquí: convierte a UTC y a partir de las 17:00 en
 * Los Mochis devolvería la fecha de mañana.
 */
function comoFecha(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

function rangoDe(rango: Rango): { desde: string; hasta: string } {
  const hoy = new Date()
  const hasta = comoFecha(hoy)
  if (rango === 'hoy') return { desde: hasta, hasta }

  const inicio = new Date(hoy)
  inicio.setDate(hoy.getDate() - (rango === 'semana' ? 6 : 29))
  return { desde: comoFecha(inicio), hasta }
}

export default function Reportes() {
  const [rango, setRango] = useState<Rango>('hoy')
  const [reporte, setReporte] = useState<Reporte | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async (r: Rango) => {
    setCargando(true)
    const { desde, hasta } = rangoDe(r)
    const { data, error: fallo } = await supabase.rpc('sales_report', {
      p_from: desde,
      p_to: hasta,
    })
    setCargando(false)

    if (fallo) {
      // Una pantalla en blanco se lee como «no vendimos nada», que es una
      // conclusión muy distinta de «no se pudo consultar».
      setError(errorMessage(fallo))
      setReporte(null)
      return
    }
    setError(null)
    setReporte(data as unknown as Reporte)
  }, [])

  useEffect(() => {
    void cargar(rango)
  }, [rango, cargar])

  const r = reporte?.resumen

  return (
    <ScrollView
      style={p.pantalla}
      contentContainerStyle={p.contenido}
      refreshControl={
        <RefreshControl refreshing={cargando} onRefresh={() => void cargar(rango)} tintColor={color.primary} />
      }
    >
      <View style={p.filtros}>
        <Chip label="Hoy" active={rango === 'hoy'} onPress={() => setRango('hoy')} />
        <Chip label="7 días" active={rango === 'semana'} onPress={() => setRango('semana')} />
        <Chip label="30 días" active={rango === 'mes'} onPress={() => setRango('mes')} />
      </View>

      {error ? (
        <View style={p.error}>
          <Text style={s.body}>{error}</Text>
        </View>
      ) : null}

      {cargando && !reporte ? (
        <View style={p.centro}>
          <ActivityIndicator color={color.primary} />
        </View>
      ) : null}

      {r ? (
        <>
          <View style={p.cifra}>
            <Text style={s.label}>Vendido</Text>
            <Text style={s.priceDisplay}>{formatPrice(r.bruto_cents, true)}</Text>
            <Text style={s.bodyMuted}>
              {`${r.pedidos} ${r.pedidos === 1 ? 'venta' : 'ventas'} · ${r.piezas} ${r.piezas === 1 ? 'pieza' : 'piezas'}`}
            </Text>
          </View>

          <View style={p.pareja}>
            <Dato etiqueta="Ticket promedio" valor={formatPrice(r.ticket_promedio_cents, true)} />
            <Dato etiqueta="Cobrado" valor={formatPrice(r.cobrado_cents, true)} />
          </View>

          {r.devoluciones_cents > 0 ? (
            <View style={p.pareja}>
              <Dato etiqueta="Devoluciones" valor={formatPrice(r.devoluciones_cents, true)} />
              <Dato etiqueta="Neto" valor={formatPrice(r.neto_cents, true)} />
            </View>
          ) : null}

          <Bloque titulo="Por canal" vacio="Sin ventas en este periodo.">
            {reporte.por_canal.map((c) => (
              <Fila
                key={c.canal}
                etiqueta={`${CANALES[c.canal] ?? c.canal} · ${c.pedidos}`}
                valor={formatPrice(c.bruto_cents, true)}
              />
            ))}
          </Bloque>

          <Bloque titulo="Por forma de pago" vacio="Sin cobros en este periodo.">
            {reporte.por_metodo_pago.map((m) => (
              <Fila
                key={m.metodo}
                etiqueta={`${METODOS[m.metodo] ?? m.metodo} · ${m.cobros}`}
                valor={formatPrice(m.cents, true)}
              />
            ))}
          </Bloque>

          {rango !== 'hoy' ? (
            <Bloque titulo="Día por día" vacio="Sin días que mostrar.">
              {/* En orden inverso: lo más reciente primero, que es lo que se
                  viene a mirar. El panel los pinta en orden cronológico porque
                  ahí se lee la tendencia entera. */}
              {[...reporte.por_dia].reverse().map((d) => (
                <Fila
                  key={d.dia}
                  etiqueta={diaCorto(d.dia)}
                  valor={d.bruto_cents === 0 ? '—' : formatPrice(d.bruto_cents)}
                  tenue={d.bruto_cents === 0}
                />
              ))}
            </Bloque>
          ) : null}

          <Text style={p.nota}>
            El desglose fiscal y lo más vendido están en el panel, desde el navegador.
          </Text>
        </>
      ) : null}
    </ScrollView>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={p.dato}>
      <Text style={s.label}>{etiqueta}</Text>
      <Text style={s.price}>{valor}</Text>
    </View>
  )
}

function Bloque({
  titulo,
  vacio,
  children,
}: {
  titulo: string
  vacio: string
  children: React.ReactNode
}) {
  const hay = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return (
    <View style={p.bloque}>
      <Text style={s.label}>{titulo}</Text>
      {hay ? children : <Text style={s.bodyMuted}>{vacio}</Text>}
    </View>
  )
}

function Fila({
  etiqueta,
  valor,
  tenue = false,
}: {
  etiqueta: string
  valor: string
  tenue?: boolean
}) {
  return (
    <View style={p.fila}>
      <Text style={tenue ? s.bodyMuted : s.body} numberOfLines={1}>
        {etiqueta}
      </Text>
      <Text style={tenue ? s.bodyMuted : s.body}>{valor}</Text>
    </View>
  )
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Sin `new Date(cadena)`: se interpretaría como UTC y pintaría el día anterior. */
function diaCorto(iso: string): string {
  const [, m, d] = iso.split('-')
  if (!m || !d) return iso
  return `${Number(d)} ${MESES[Number(m) - 1] ?? m}`
}

const p = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.surface },
  contenido: { padding: space.edge, gap: space.gutter, paddingBottom: space.sectionMd },
  filtros: { flexDirection: 'row', gap: space.gap, flexWrap: 'wrap' },
  centro: { paddingVertical: space.sectionMd, alignItems: 'center' },

  cifra: {
    backgroundColor: color['paper-bright'],
    borderWidth: 1,
    borderColor: color.primary,
    padding: space.gutter,
    gap: 2,
  },
  pareja: { flexDirection: 'row', gap: space.gap },
  dato: {
    flex: 1,
    backgroundColor: color['paper-bright'],
    borderWidth: 1,
    borderColor: color['surface-variant'],
    padding: space.gutter,
    gap: 2,
  },

  bloque: {
    backgroundColor: color['paper-bright'],
    borderWidth: 1,
    borderColor: color['surface-variant'],
    padding: space.gutter,
    gap: 6,
  },
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.gap,
    minHeight: size.touchMin - 12,
  },
  nota: { ...text.bodyMd, fontSize: 13, color: color['text-muted'] },
  error: {
    borderWidth: 1,
    borderColor: color.primary,
    padding: space.gutter,
  },
})
