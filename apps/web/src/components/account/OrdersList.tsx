import Image from 'next/image'
import Link from 'next/link'
import { Badge, Button, EmptyState, formatDate, formatPrice } from '@lumane/ui-web'

import type { AccountOrder } from '@/lib/queries/account'

/**
 * Estados del pedido, con el icono y el contraste que les da el prototipo:
 * sólido para lo que está en movimiento, contorno para lo terminado y tenue
 * para lo que aún no arranca.
 */
const STATUS: Record<
  string,
  { label: string; icon: string; variant: 'solid' | 'outline' | 'data' }
> = {
  placed: { label: 'Recibido', icon: 'inventory_2', variant: 'data' },
  preparing: { label: 'Preparando', icon: 'inventory_2', variant: 'data' },
  packed: { label: 'Empacado', icon: 'inventory_2', variant: 'outline' },
  shipped: { label: 'En camino', icon: 'local_shipping', variant: 'solid' },
  delivered: { label: 'Entregado', icon: 'check_circle', variant: 'outline' },
  completed: { label: 'Completado', icon: 'check_circle', variant: 'outline' },
  cancelled: { label: 'Cancelado', icon: 'close', variant: 'data' },
}

export function OrdersList({ orders }: { orders: AccountOrder[] }) {
  if (orders.length === 0) {
    return (
      <EmptyState
        icon="inventory_2"
        title="Todavía no tienes pedidos"
        body="Cuando compres algo, aquí podrás seguir su estado y consultar el detalle."
        action={
          <Button href="/catalogo" variant="outline" size="md">
            Ver el catálogo
          </Button>
        }
      />
    )
  }

  return (
    <ul className="flex flex-col divide-y divide-surface-variant">
      {orders.map((order) => {
        const status = STATUS[order.status] ?? {
          label: order.status,
          icon: 'inventory_2',
          variant: 'data' as const,
        }

        return (
          <li
            key={order.orderNumber}
            className="py-6 flex flex-col md:flex-row md:items-center gap-4 md:gap-8"
          >
            <div className="relative w-16 h-20 flex-shrink-0 border border-surface-variant bg-editorial-ink overflow-hidden">
              <Image
                src={order.imageUrl}
                alt=""
                fill
                sizes="64px"
                className="object-cover"
              />
            </div>

            <div className="flex-grow min-w-0">
              <p className="font-body-md text-body-md">
                Pedido {order.orderNumber} · {order.items}{' '}
                {order.items === 1 ? 'artículo' : 'artículos'}
              </p>
              <p className="font-label-upper text-[10px] uppercase tracking-[0.16em] text-secondary mt-1">
                {order.placedAt ? formatDate(order.placedAt) : 'Sin fecha'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={status.variant} icon={status.icon}>
                {status.label}
              </Badge>
              {/* Un pedido por transferencia sin depósito recibido tiene que
                  decirlo aquí: es lo que la clienta necesita saber. */}
              {order.paymentStatus === 'pending' ? (
                <Badge variant="outline">Falta el pago</Badge>
              ) : null}
            </div>

            <p className="font-price text-price md:w-28 md:text-right">
              {formatPrice(order.totalCents, true)}
            </p>

            <Link
              href={
                order.guestToken
                  ? `/pedido/${order.orderNumber}?t=${order.guestToken}`
                  : `/pedido/${order.orderNumber}`
              }
              className="font-label-upper text-label-upper uppercase underline underline-offset-4 hover:text-accent-red transition-colors whitespace-nowrap"
            >
              Ver detalle
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
