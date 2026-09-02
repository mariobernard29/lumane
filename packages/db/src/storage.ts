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

export interface ImageTransform {
  width?: number
  height?: number
  /** 20–100. Por debajo de 70 el grano del prototipo se ve sucio. */
  quality?: number
  resize?: 'cover' | 'contain' | 'fill'
}

/**
 * URL pública con transformación en el servidor de Supabase. Una sola imagen
 * de origen sirve todos los tamaños del `srcset`, así que no hay que subir
 * variantes ni regenerarlas cuando cambia el diseño.
 */
export function imageUrl(
  supabaseUrl: string,
  path: string,
  bucket: BucketName = BUCKETS.products,
  transform: ImageTransform = {},
): string {
  const base = supabaseUrl.replace(/\/$/, '')
  const params = new URLSearchParams()
  if (transform.width) params.set('width', String(transform.width))
  if (transform.height) params.set('height', String(transform.height))
  params.set('quality', String(transform.quality ?? 78))
  if (transform.resize) params.set('resize', transform.resize)

  const clean = path.replace(/^\/+/, '')
  return `${base}/storage/v1/render/image/public/${bucket}/${clean}?${params.toString()}`
}

/** Ruta canónica de una foto de producto. */
export function productImagePath(productId: string, fileName: string): string {
  return `${productId}/${fileName}`
}
