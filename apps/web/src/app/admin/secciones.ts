/**
 * Las secciones del panel, en un módulo aparte.
 *
 * Vive fuera de `layout.tsx` porque el índice también las necesita, y un
 * archivo de layout de Next debe exportar su componente y sus metadatos, no
 * datos que otras pantallas importan.
 *
 * El `permiso` es el mismo que gobierna la escritura en la base: una encargada
 * con `cms.write` verá contenido pero no catálogo, que es la separación que
 * los roles ya describían desde la migración 0002.
 */
export interface Seccion {
  href: string
  label: string
  permiso: string
  descripcion: string
}

export const SECCIONES: Seccion[] = [
  {
    href: '/admin/ajustes',
    label: 'Ajustes',
    permiso: 'cms.write',
    descripcion: 'Contacto, horario, redes y el texto del boletín.',
  },
  {
    href: '/admin/menus',
    label: 'Menús',
    permiso: 'cms.write',
    descripcion: 'La navegación de arriba y las columnas del pie.',
  },
  {
    href: '/admin/portada',
    label: 'Portada',
    permiso: 'cms.write',
    descripcion: 'El hero y los bloques de la página de inicio.',
  },
  {
    href: '/admin/paginas',
    label: 'Páginas',
    permiso: 'cms.write',
    descripcion: 'Textos del sitio y preguntas frecuentes.',
  },
  {
    href: '/admin/boutique',
    label: 'La boutique',
    permiso: 'cms.write',
    descripcion: 'Las fotos del local que se ven en la página de la tienda.',
  },
  {
    href: '/admin/envios',
    label: 'Envíos',
    // `cms.write` porque es lo que exige RLS en `local_delivery_rates` desde
    // la 0011. No es inventario ni dinero de una venta ya hecha.
    permiso: 'cms.write',
    descripcion: 'Lo que cuesta la entrega local en cada tramo de 2 km.',
  },
  {
    href: '/admin/catalogo',
    label: 'Catálogo',
    permiso: 'inventory.write',
    descripcion: 'Prendas, variantes, precios y fotografía.',
  },
  {
    href: '/admin/reportes',
    label: 'Reportes',
    // El único que no es `cms.write` ni `inventory.write`: `reports.read` lo
    // tienen `manager` y `owner`, pero no la cajera. Lo que vende la tienda no
    // es asunto de quien está en el mostrador.
    permiso: 'reports.read',
    descripcion: 'Cuánto se vendió, por canal, por forma de pago y por día.',
  },
]
