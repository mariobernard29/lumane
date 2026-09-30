import { formatPrice } from '@lumane/ui-web'

import { createServerSupabase } from '@/lib/supabase/server'
import { StatusNote } from '@/components/admin/primitivos'

/**
 * El reporte de ventas.
 *
 * Vive en el panel y no en el POS por lo que es: tablas densas que se leen
 * sentada, con el navegador dando copiar y exportar que React Native no da. El
 * mismo `sales_report` serviría a la tablet si algún día hiciera falta.
 *
 * **Todo el cálculo está en la base.** Esta pantalla no suma ni promedia nada:
 * pide el reporte y lo pinta. Es la ADR 0001 aplicada al caso donde más tienta
 * saltársela, porque «total dividido entre pedidos» parece inofensivo hasta
 * que el POS y el panel dan cifras distintas por redondear en sitios
 * distintos.
 *
 * Los días son días de la BOUTIQUE, no de UTC: la conversión la hace el RPC
 * con `locations.timezone`. En Los Mochis (UTC−7) todo lo vendido después de
 * las 17:00 cae en el día siguiente si se cuenta en UTC — buena parte de la
 * tarde en el día que no fue.
 */

interface Reporte {
  desde: string
  hasta: string
  zona: string
  resumen: {
    pedidos: number
    piezas: number
    bruto_cents: number
    base_cents: number
    iva_cents: number
    descuentos_cents: number
    envios_cents: number
    devoluciones: number
    devoluciones_cents: number
    neto_cents: number
    cobrado_cents: number
    ticket_promedio_cents: number
  }
  por_canal: { canal: string; pedidos: number; bruto_cents: number }[]
  por_metodo_pago: { metodo: string; cobros: number; cents: number }[]
  por_dia: { dia: string; pedidos: number; bruto_cents: number }[]
  top_prendas: { product_id: string; product_name: string; piezas: number; cents: number }[]
}

const CANALES: Record<string, string> = { pos: 'Mostrador', online: 'Tienda en línea' }

const METODOS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta (terminal)',
  transfer: 'Transferencia',
  stripe: 'Tarjeta en línea',
  store_credit: 'Saldo a favor',
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>
}) {
  const { desde = '', hasta = '' } = await searchParams
  const supabase = await createServerSupabase()

  // Se mandan `undefined` y no cadenas vacías: el RPC tiene por omisión los
  // últimos 30 días contados en la zona de la tienda, y calcularlos aquí sería
  // volver a resolver en JavaScript lo que la base ya resuelve bien.
  const { data, error } = await supabase.rpc('sales_report', {
    p_from: desde || undefined,
    p_to: hasta || undefined,
  })

  const reporte = data as unknown as Reporte | null

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="font-headline-md text-headline-md text-primary">Ventas</h1>
        <p className="font-body-md text-body-md text-text-muted">
          {reporte
            ? `Del ${diaLargo(reporte.desde)} al ${diaLargo(reporte.hasta)} · horario de la boutique`
            : 'Resumen de ventas por periodo.'}
        </p>
      </header>

      <form className="flex flex-wrap items-end gap-3">
        <Fecha id="desde" label="Desde" valor={desde || reporte?.desde || ''} />
        <Fecha id="hasta" label="Hasta" valor={hasta || reporte?.hasta || ''} />
        <button
          type="submit"
          className="border border-primary bg-primary px-4 py-2.5 font-label-upper text-label-upper text-on-primary"
        >
          Ver
        </button>
      </form>

      {error ? <StatusNote>{error.message}</StatusNote> : null}

      {reporte ? (
        <>
          {/* Lo vendido y lo cobrado, uno al lado del otro. No son lo mismo y
              es justo la pareja que enseña si falta dinero por entrar. */}
          <section className="grid gap-3 sm:grid-cols-2">
            <Cifra
              titulo="Vendido"
              valor={formatPrice(reporte.resumen.bruto_cents, true)}
              nota={`${reporte.resumen.pedidos} ${reporte.resumen.pedidos === 1 ? 'venta' : 'ventas'} · ${reporte.resumen.piezas} ${reporte.resumen.piezas === 1 ? 'pieza' : 'piezas'}`}
              grande
            />
            <Cifra
              titulo="Cobrado"
              valor={formatPrice(reporte.resumen.cobrado_cents, true)}
              nota="Pagos recibidos, ya descontadas las devoluciones"
              grande
            />
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <Cifra titulo="Ticket promedio" valor={formatPrice(reporte.resumen.ticket_promedio_cents, true)} />
            <Cifra
              titulo="Devoluciones"
              valor={formatPrice(reporte.resumen.devoluciones_cents, true)}
              nota={`${reporte.resumen.devoluciones} en el periodo`}
            />
            <Cifra titulo="Neto" valor={formatPrice(reporte.resumen.neto_cents, true)} nota="Vendido menos devuelto" />
          </section>

          {/* El IVA va DENTRO de los precios (regla 4), así que la base se
              obtiene restando. Decirlo aquí evita que alguien multiplique por
              1.16 al pasar estas cifras a la contadora. */}
          <Bloque titulo="Desglose fiscal">
            <Fila etiqueta="Base gravable" valor={formatPrice(reporte.resumen.base_cents, true)} />
            <Fila etiqueta="IVA incluido (16 %)" valor={formatPrice(reporte.resumen.iva_cents, true)} />
            <Fila etiqueta="Total cobrado a las clientas" valor={formatPrice(reporte.resumen.bruto_cents, true)} destacada />
            <Fila etiqueta="Descuentos aplicados" valor={formatPrice(reporte.resumen.descuentos_cents, true)} />
            <Fila etiqueta="Envíos" valor={formatPrice(reporte.resumen.envios_cents, true)} />
          </Bloque>

          <Bloque titulo="Por canal">
            {reporte.por_canal.length === 0 ? (
              <Vacio>Sin ventas en el periodo.</Vacio>
            ) : (
              reporte.por_canal.map((c) => (
                <Fila
                  key={c.canal}
                  etiqueta={`${CANALES[c.canal] ?? c.canal} · ${c.pedidos} ${c.pedidos === 1 ? 'venta' : 'ventas'}`}
                  valor={formatPrice(c.bruto_cents, true)}
                />
              ))
            )}
          </Bloque>

          <Bloque titulo="Por forma de pago">
            {reporte.por_metodo_pago.length === 0 ? (
              <Vacio>Sin cobros en el periodo.</Vacio>
            ) : (
              reporte.por_metodo_pago.map((m) => (
                <Fila
                  key={m.metodo}
                  etiqueta={`${METODOS[m.metodo] ?? m.metodo} · ${m.cobros}`}
                  valor={formatPrice(m.cents, true)}
                />
              ))
            )}
          </Bloque>

          <Bloque titulo="Lo más vendido">
            {reporte.top_prendas.length === 0 ? (
              <Vacio>Todavía no hay prendas vendidas en este periodo.</Vacio>
            ) : (
              reporte.top_prendas.map((p) => (
                <Fila
                  key={p.product_id}
                  etiqueta={`${p.product_name} · ${p.piezas} ${p.piezas === 1 ? 'pieza' : 'piezas'}`}
                  valor={formatPrice(p.cents, true)}
                />
              ))
            )}
          </Bloque>

          <Bloque titulo="Día por día">
            <PorDia dias={reporte.por_dia} />
          </Bloque>
        </>
      ) : null}
    </div>
  )
}

/**
 * La serie diaria, como barras de ancho proporcional.
 *
 * Una barra con `width` en porcentaje y no una gráfica: no hay librería de
 * gráficas en el proyecto y traer uno para esto sería decidir por todas las
 * pantallas futuras. Se lee igual de bien y funciona sin JavaScript.
 *
 * Los días sin ventas SÍ salen, con su cero. El RPC los devuelve a propósito:
 * si se omitieran, una semana floja se dibujaría como una línea continua y
 * parecería un periodo normal.
 */
function PorDia({ dias }: { dias: Reporte['por_dia'] }) {
  const tope = Math.max(...dias.map((d) => d.bruto_cents), 1)

  return (
    <div className="grid gap-1.5">
      {dias.map((d) => (
        <div key={d.dia} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3">
          <span className="font-body-md text-body-md text-text-muted">{diaCorto(d.dia)}</span>
          <span className="h-2 bg-surface-variant" aria-hidden="true">
            <span
              className="block h-full bg-primary"
              style={{ width: `${(d.bruto_cents / tope) * 100}%` }}
            />
          </span>
          <span className="font-price text-price text-primary tabular-nums">
            {d.bruto_cents === 0 ? '—' : formatPrice(d.bruto_cents)}
          </span>
        </div>
      ))}
    </div>
  )
}

function Cifra({
  titulo,
  valor,
  nota,
  grande = false,
}: {
  titulo: string
  valor: string
  nota?: string
  grande?: boolean
}) {
  return (
    <div className="border border-outline-variant bg-paper-bright p-4">
      <p className="font-label-upper text-label-upper text-secondary">{titulo}</p>
      {/* `headline-lg` y no un `display-*`: los únicos display del sistema son
          `display-xl` y su variante móvil, pensados para el hero de la
          portada. Aquí aplastarían la tarjeta. */}
      <p
        className={`text-primary tabular-nums ${grande ? 'font-headline-lg text-headline-lg' : 'font-price text-price'}`}
      >
        {valor}
      </p>
      {nota ? <p className="font-body-md text-body-md text-text-muted">{nota}</p> : null}
    </div>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="border border-outline-variant bg-paper-bright p-4">
      <h2 className="mb-2 font-label-upper text-label-upper text-secondary">{titulo}</h2>
      {children}
    </section>
  )
}

function Fila({
  etiqueta,
  valor,
  destacada = false,
}: {
  etiqueta: string
  valor: string
  destacada?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-surface-variant py-2 last:border-b-0">
      <span className="font-body-md text-body-md text-primary">{etiqueta}</span>
      <span
        className={`tabular-nums text-primary ${destacada ? 'font-price text-price' : 'font-body-md text-body-md'}`}
      >
        {valor}
      </span>
    </div>
  )
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="font-body-md text-body-md text-text-muted">{children}</p>
}

function Fecha({ id, label, valor }: { id: string; label: string; valor: string }) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="font-label-upper text-label-upper text-secondary">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="date"
        defaultValue={valor}
        className="border border-outline-variant bg-paper-bright px-3 py-2.5 font-body-md text-body-md text-primary outline-none focus:border-primary"
      />
    </div>
  )
}

/**
 * Las fechas se formatean SIN `new Date(cadena)`.
 *
 * `new Date('2026-09-22')` se interpreta como medianoche UTC y en México se
 * pinta como el 21. El RPC ya devolvió el día correcto en hora de la boutique;
 * pasarlo por `Date` volvería a romper justo lo que la migración arregló.
 */
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function diaLargo(iso: string): string {
  const [a, m, d] = iso.split('-')
  if (!a || !m || !d) return iso
  return `${Number(d)} de ${MESES[Number(m) - 1] ?? m} de ${a}`
}

function diaCorto(iso: string): string {
  const [, m, d] = iso.split('-')
  if (!m || !d) return iso
  return `${Number(d)} ${(MESES[Number(m) - 1] ?? m).slice(0, 3)}`
}
