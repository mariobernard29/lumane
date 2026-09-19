import { Pending } from '@/ui/Pending'

export default function Inventario() {
  return (
    <Pending
      title="Inventario"
      summary="Alta y edición de prendas, entradas, ajustes y conteos. Es la Fase 3 del plan; los RPC que lo sostienen ya están en la base y probados."
      items={[
        'Alta y duplicado de productos con sus variantes',
        'Fotografía con la cámara de la tablet',
        'Entradas de mercancía y ajustes con motivo',
        'Conteo físico y alertas de stock bajo',
      ]}
    />
  )
}
