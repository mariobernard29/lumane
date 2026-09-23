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
    href: '/admin/catalogo',
    label: 'Catálogo',
    permiso: 'inventory.write',
    descripcion: 'Prendas, variantes, precios y fotografía.',
  },
]
