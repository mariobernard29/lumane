import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Badge, Breadcrumbs, Button, Icon, formatDate, formatPrice } from '@lumane/ui-web'

import { createServerSupabase } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Tu pedido',
  robots: { index: false },
}

interface PageProps {
  params: Promise<{ numero: string }>
  searchParams: Promise<{ t?: string }>
}

interface OrderView {
  order_number: string
  status: string
  payment_status: string
  subtotal_cents: number
  discount_cents: number
  shipping_cents: number
  tax_cents: number
  total_cents: number
  placed_at: string | null
  shipping_address: Record<string, string | null> | null
  shipping_method_snapshot: { name?: string; description?: string; kind?: string } | null
}

interface OrderLineView {
  id: string
  product_name: string
  variant_title: string
  sku: string
  quantity: number
  total_cents: number
}

const STATUS_LABELS: Record<string, string> = {
  placed: 'Pedido recibido',
  preparing: 'Preparando tu pedido',
  packed: 'Empacado',
  shipped: 'En camino',
  delivered: 'Entregado',
  completed: 'Completado',
  cancelled: 'Cancelado',
}

/** Cuando se recoge en boutique, «enviado» quiere decir que ya espera en el mostrador. */
const STATUS_LABELS_RECOGER: Record<string, string> = {
  shipped: 'Listo para recoger',
  delivered: 'Recogido',
}

/**
 * Confirmación y seguimiento del pedido.
 *
 * Una invitada llega con el token que recibió por correo (`?t=`), así que la
 * consulta va por `get_order_by_token`, que exige número Y token. Una clienta
 * con sesión lo ve por RLS sin necesidad del token.
 *
 * La página existe con URL propia a propósito: el prototipo terminaba el flujo
 * sin ninguna pantalla de confirmación, y ese es el momento en que alguien
 * quiere guardar el enlace o reenviárselo a quien le regala.
 */
export default async function OrderPage({ params, searchParams }: PageProps) {
  const [{ numero }, { t }] = await Promise.all([params, searchParams])
  const supabase = await createServerSupabase()

  let order: OrderView | null = null
  let lines: OrderLineView[] = []

  if (t) {
    const { data } = await supabase.rpc('get_order_by_token', {
      p_order_number: numero,
      p_guest_token: t,
    })
    if (data) {
      const raw = data as unknown as { order: OrderView; lines: OrderLineView[] }
      order = raw.order
      lines = raw.lines ?? []
    }
  } else {
    // Sin token: solo funciona con sesión, y RLS limita a los pedidos propios.
    const { data } = await supabase
      .from('orders')
      .select(
        'order_number, status, payment_status, subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents, placed_at, shipping_address, shipping_method_snapshot, order_lines(id, product_name, variant_title, sku, quantity, total_cents)',
      )
      .eq('order_number', numero)
      .maybeSingle()

    if (data) {
      order = data as unknown as OrderView
      lines = (data.order_lines ?? []) as unknown as OrderLineView[]
    }
  }

  if (!order) notFound()

  const address = order.shipping_address
  const isPending = order.payment_status === 'pending'

  return (
    <>
      <Breadcrumbs items={[{ label: 'Inicio', href: '/' }, { label: `Pedido ${order.order_number}` }]} />

      <section className="px-5 sm:px-margin-edge pt-8 pb-section-v-md md:pb-section-v-lg">
        <div className="border border-primary p-8 md:p-12 mb-10">
          <p className="font-label-upper text-label-upper uppercase text-accent-red mb-4">
            {(order.shipping_method_snapshot?.kind === 'pickup'
              ? STATUS_LABELS_RECOGER[order.status]
              : undefined) ??
              STATUS_LABELS[order.status] ??
              order.status}
          </p>
          <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg mb-4">
            Gracias por tu compra
          </h1>
          <p className="font-body-md md:font-body-lg text-body-md md:text-body-lg text-secondary max-w-xl">
            Tu pedido <strong className="text-primary">{order.order_number}</strong> quedó registrado
            {order.placed_at ? ` el ${formatDate(order.placed_at)}` : ''}. Te enviamos la
            confirmación por correo.
          </p>

          {isPending ? (
            <div className="border border-primary bg-paper-bright p-6 mt-8 max-w-xl">
              <p className="font-label-upper text-label-upper uppercase mb-3 flex items-center gap-2">
                <Icon name="credit_card" size={16} />
                Falta tu transferencia
              </p>
              <p className="font-body-md text-body-md text-secondary">
                Apartamos tus piezas. En el correo van los datos de la cuenta y el importe exacto:{' '}
                <strong className="text-primary">{formatPrice(order.total_cents, true)}</strong>. En
                cuanto recibamos el depósito preparamos tu envío.
              </p>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-col-gap items-start">
          <div className="lg:col-span-7">
            <h2 className="font-label-upper text-label-upper uppercase border-b border-primary pb-3 mb-2">
              Piezas
            </h2>
            <ul className="flex flex-col divide-y divide-surface-variant">
              {lines.map((line) => (
                <li key={line.id} className="py-5 flex items-start justify-between gap-6">
                  <div>
                    <p className="font-body-md text-body-md">{line.product_name}</p>
                    <p className="font-label-upper text-label-upper uppercase text-secondary mt-1">
                      {line.variant_title ? `Talla ${line.variant_title} · ` : ''}
                      {line.quantity} {line.quantity === 1 ? 'pieza' : 'piezas'} · SKU {line.sku}
                    </p>
                  </div>
                  <p className="font-price text-price whitespace-nowrap">
                    {formatPrice(line.total_cents, true)}
                  </p>
                </li>
              ))}
            </ul>

            {address ? (
              <>
                <h2 className="font-label-upper text-label-upper uppercase border-b border-primary pb-3 mb-4 mt-10">
                  Entrega
                </h2>
                <p className="font-body-md text-body-md text-secondary">
                  {order.shipping_method_snapshot?.name ? (
                    <Badge variant="data" className="mb-3">
                      {order.shipping_method_snapshot.name}
                    </Badge>
                  ) : null}
                  <br />
                  {address.recipient}
                  <br />
                  {[address.street, address.ext_no, address.int_no ? `int. ${address.int_no}` : null]
                    .filter(Boolean)
                    .join(' ')}
                  <br />
                  {[address.neighborhood, address.city, address.state].filter(Boolean).join(', ')}
                  <br />
                  C.P. {address.postal_code}
                  {address.phone ? ` · Tel. ${address.phone}` : ''}
                </p>
              </>
            ) : null}
          </div>

          <aside className="lg:col-span-5 border border-primary bg-surface p-6 md:p-8">
            <h2 className="font-headline-md text-headline-md mb-6">Resumen</h2>
            <dl className="flex flex-col gap-3 font-body-md text-body-md border-b border-surface-variant pb-6">
              <div className="flex justify-between">
                <dt className="text-secondary">Subtotal</dt>
                <dd className="font-price text-price">{formatPrice(order.subtotal_cents, true)}</dd>
              </div>
              {order.discount_cents > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-secondary">Descuento</dt>
                  <dd className="font-price text-price text-accent-red">
                    −{formatPrice(order.discount_cents, true)}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-secondary">Envío</dt>
                <dd className="font-price text-price">
                  {order.shipping_cents === 0 ? 'Gratis' : formatPrice(order.shipping_cents, true)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-secondary">IVA</dt>
                <dd className="font-label-upper text-label-upper uppercase text-secondary">
                  Incluido · {formatPrice(order.tax_cents, true)}
                </dd>
              </div>
            </dl>

            <div className="flex justify-between items-baseline mt-6 mb-8">
              <span className="font-label-upper text-label-upper uppercase">Total</span>
              <span className="font-headline-md text-headline-md">
                {formatPrice(order.total_cents, true)}
              </span>
            </div>

            <Button href="/catalogo" variant="outline" fullWidth size="md">
              Seguir comprando
            </Button>
          </aside>
        </div>
      </section>
    </>
  )
}
