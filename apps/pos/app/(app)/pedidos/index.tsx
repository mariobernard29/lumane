import { Pending } from '@/ui/Pending'

export default function Pedidos() {
  return (
    <Pending
      title="Pedidos en línea"
      summary="La bandeja de pedidos de la tienda, en vivo sobre el mostrador. Cierra la Fase 2 junto con devoluciones e impresión."
      items={[
        'Aviso sonoro cuando entra un pedido (Supabase Realtime)',
        'Cambio de estado: preparando, empacado, enviado, entregado',
        'Historial de ventas del mostrador y reimpresión de ticket',
        'Devoluciones con reintegro de inventario',
      ]}
    />
  )
}
