/**
 * Rutas e imágenes de Supabase Storage.
 *
 * En la base se guarda SIEMPRE el `storage_path` (p. ej.
 * `products/{product_id}/{uuid}.webp`), nunca una URL completa. Si mañana la
 * boutique cambia de proyecto o de CDN, se ajusta una constante y no una
 * columna en miles de filas.
 */

export const BUCKETS = {
  /** Fotografía de producto. Lectura pública. */
  products: 'products',
  /** Hero, banners e imágenes editoriales. Lectura pública. */
  content: 'content',
  /** Documentos internos. Privado. */
  documents: 'documents',
} as const

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS]

/**
 * URL pública del objeto.
 *
 * **Esto apuntaba al endpoint de transformación de Supabase**
 * (`/render/image/public/...?width=…`) desde la Fase 0, y nunca se ejecutó
 * porque todas las imágenes vivían en `public/` de Next. Al migrarlas a
 * Storage, ese endpoint respondió:
 *
 *     403 {"error":"FeatureNotEnabled","message":"feature not enabled for this tenant"}
 *
 * La transformación de imágenes es un **complemento de pago** de Supabase que
 * este proyecto no tiene. Se sirve el objeto tal cual.
 *
 * No se pierde casi nada: la web pinta todas sus imágenes con `next/image`,
 * que ya redimensiona y sirve WebP desde su propio optimizador —así que la
 * transformación de Supabase era trabajo duplicado—, y el panel encoge cada
 * foto en el navegador antes de subirla, de modo que en el bucket no hay
 * originales de cuatro megas.
 *
 * El día que se contrate el complemento, cambiar esta función a
 * `/render/image/public/` y volver a aceptar tamaños es todo lo que hace falta.
 */
export function imageUrl(
  supabaseUrl: string,
  path: string,
  bucket: BucketName = BUCKETS.products,
): string {
  const base = supabaseUrl.replace(/\/$/, '')
  const clean = path.replace(/^\/+/, '')
  return `${base}/storage/v1/object/public/${bucket}/${clean}`
}

/** Ruta canónica de una foto de producto. */
export function productImagePath(productId: string, fileName: string): string {
  return `${productId}/${fileName}`
}
