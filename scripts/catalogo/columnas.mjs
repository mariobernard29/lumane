/**
 * Las columnas de la plantilla del catálogo. Las comparten quien GENERA la
 * plantilla (`plantilla.mjs`) y quien la LEE (`importar.mts`):
 * si cambia un encabezado aquí, cambia en los dos lados a la vez.
 *
 * Una fila = una variante (una talla de un color). Las filas con el mismo
 * «Código de prenda» —o, si está vacío, el mismo nombre— son la misma prenda.
 * Lo que es de la prenda (categoría, descripción, fotos…) basta con ponerlo
 * en su primera fila.
 */

/** @typedef {'texto' | 'dinero' | 'entero' | 'lista' | 'sino' | 'estado'} Tipo */

/**
 * @type {{
 *   clave: string, titulo: string, ancho: number, obligatoria?: boolean,
 *   nivel: 'prenda' | 'variante', tipo: Tipo, nota: string
 * }[]}
 */
export const COLUMNAS = [
  {
    clave: 'codigo', titulo: 'Código de prenda', ancho: 14, nivel: 'prenda', tipo: 'texto',
    nota: 'Opcional. Junta las tallas y colores de una misma prenda y es el inicio de sus SKU (1001 → 1001-CH-NEG). Si lo dejas vacío se asigna solo (1001, 1002…). No puede repetirse entre prendas distintas.',
  },
  {
    clave: 'nombre', titulo: 'Nombre de la prenda', ancho: 32, obligatoria: true, nivel: 'prenda', tipo: 'texto',
    nota: 'Como se verá en la tienda, en el ticket y en la etiqueta. Repite el mismo nombre en cada talla/color de la prenda.',
  },
  {
    clave: 'categoria', titulo: 'Categoría', ancho: 20, obligatoria: true, nivel: 'prenda', tipo: 'lista',
    nota: 'Elige de la lista. Si escribes una que no existe, se crea.',
  },
  {
    clave: 'talla', titulo: 'Talla', ancho: 12, nivel: 'variante', tipo: 'lista',
    nota: 'Una talla por fila: Chica, Mediana, Grande, Extra grande, Unitalla, 26, 28… Déjala vacía si la prenda no tiene tallas (un bolso).',
  },
  {
    clave: 'color', titulo: 'Color', ancho: 14, nivel: 'variante', tipo: 'lista',
    nota: 'Uno por fila. Déjalo vacío si la prenda viene en un solo color.',
  },
  {
    clave: 'precio', titulo: 'Precio de venta', ancho: 14, obligatoria: true, nivel: 'variante', tipo: 'dinero',
    nota: 'En pesos y CON IVA, como se cobra en caja: 1290 o 1,290.00.',
  },
  {
    clave: 'precio_antes', titulo: 'Precio antes (rebaja)', ancho: 14, nivel: 'variante', tipo: 'dinero',
    nota: 'Solo si está en rebaja: el precio tachado. Tiene que ser mayor que el precio de venta.',
  },
  {
    clave: 'costo', titulo: 'Costo', ancho: 12, nivel: 'variante', tipo: 'dinero',
    nota: 'Lo que te costó la pieza. Solo lo ven dueña y encargada (reportes de utilidad).',
  },
  {
    clave: 'existencias', titulo: 'Existencias', ancho: 12, obligatoria: true, nivel: 'variante', tipo: 'entero',
    nota: 'Piezas que hay HOY en la tienda de esta talla y color. Si vuelves a importar, se fija este número (no se suma).',
  },
  {
    clave: 'codigo_barras', titulo: 'Código de barras', ancho: 18, nivel: 'variante', tipo: 'texto',
    nota: 'Solo si la prenda ya trae un código de barras del proveedor. Si no, la etiqueta de Lumane usa el SKU.',
  },
  {
    clave: 'sku', titulo: 'SKU', ancho: 16, nivel: 'variante', tipo: 'texto',
    nota: 'Déjalo vacío: se arma solo con el código de prenda, la talla y el color (1001-CH-NEG). Escríbelo solo si ya tienes uno propio.',
  },
  {
    clave: 'marca', titulo: 'Marca', ancho: 14, nivel: 'prenda', tipo: 'texto', nota: 'Opcional.',
  },
  {
    clave: 'descripcion_corta', titulo: 'Descripción corta', ancho: 36, nivel: 'prenda', tipo: 'texto',
    nota: 'Una o dos frases. Sale debajo del nombre en la tienda en línea.',
  },
  {
    clave: 'descripcion', titulo: 'Descripción larga', ancho: 44, nivel: 'prenda', tipo: 'texto',
    nota: 'Opcional. El texto completo de la ficha.',
  },
  {
    clave: 'composicion', titulo: 'Composición', ancho: 22, nivel: 'prenda', tipo: 'texto',
    nota: 'Ej.: Algodón 100%. Varias líneas separadas por punto y coma.',
  },
  {
    clave: 'cuidados', titulo: 'Cuidados', ancho: 26, nivel: 'prenda', tipo: 'texto',
    nota: 'Ej.: Lavar a mano; No usar secadora. Separadas por punto y coma.',
  },
  {
    clave: 'colecciones', titulo: 'Colecciones', ancho: 24, nivel: 'prenda', tipo: 'lista',
    nota: 'Opcional. Una o varias separadas por coma. Tienen que existir ya en el panel.',
  },
  {
    clave: 'fotos', titulo: 'Fotos', ancho: 26, nivel: 'prenda', tipo: 'texto',
    nota: 'Opcional. Nombres de archivo separados por coma (vestido-1.jpg, vestido-2.jpg). Mándame las fotos en una carpeta junto con este archivo. La primera es la portada.',
  },
  {
    clave: 'en_linea', titulo: 'En tienda en línea', ancho: 12, nivel: 'prenda', tipo: 'sino',
    nota: 'Sí: se vende también en la web. No: solo en la boutique. Vacío = Sí.',
  },
  {
    clave: 'estado', titulo: 'Estado', ancho: 12, nivel: 'prenda', tipo: 'estado',
    nota: 'Activo: a la venta. Borrador: guardada pero sin publicar. Vacío = Activo.',
  },
  {
    clave: 'ubicacion', titulo: 'Ubicación en tienda', ancho: 16, nivel: 'variante', tipo: 'texto',
    nota: 'Opcional. Percha, cajón o bodega.',
  },
  {
    clave: 'minimo', titulo: 'Avisar con menos de', ancho: 12, nivel: 'variante', tipo: 'entero',
    nota: 'Opcional. Piezas a partir de las cuales Inventario la marca como «pocas». Vacío = 2.',
  },
]

export const HOJA_CATALOGO = 'Catálogo'
export const HOJA_EJEMPLO = 'Ejemplo'
export const HOJA_INSTRUCCIONES = 'Instrucciones'
export const HOJA_LISTAS = 'Listas'

export const TALLAS = ['Extra chica', 'Chica', 'Mediana', 'Grande', 'Extra grande', 'Unitalla', 'XS', 'S', 'M', 'L', 'XL', '24', '26', '28', '30', '32', '34', '36']
export const COLORES = ['Negro', 'Blanco', 'Hueso', 'Beige', 'Camel', 'Café', 'Gris', 'Rojo', 'Rosa', 'Azul', 'Azul marino', 'Verde', 'Verde olivo', 'Amarillo', 'Morado', 'Dorado', 'Plateado', 'Estampado']
