import { Pending } from '@/ui/Pending'

export default function Clientes() {
  return (
    <Pending
      title="Clientes"
      summary="La misma tabla que usa la tienda en línea: quien compra en el mostrador y luego se registra en la web encuentra su historial ya ahí."
      items={[
        'Alta rápida en dos campos durante el cobro',
        'Búsqueda por nombre, teléfono o correo',
        'Historial de compras y piezas favoritas',
      ]}
    />
  )
}
