import { BUCKETS, imageUrl, type BucketName, type ImageTransform } from '@lumane/db'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

/**
 * Convierte el `storage_path` guardado en la base en una URL servible.
 *
 * La transformación ocurre en el servidor de Supabase, así que una sola imagen
 * de origen cubre todos los tamaños del `srcset` sin subir variantes.
 */
export function storageUrl(
  path: string | null | undefined,
  bucket: BucketName = BUCKETS.products,
  transform?: ImageTransform,
): string {
  if (!path) return PLACEHOLDER

  // Escape hatch deliberado: una ruta que empieza por "/" es un recurso local
  // de `public/`. Lo usa la siembra inicial —las doce fotos del prototipo, que
  // aún no están en Storage— y el logotipo, que no tiene por qué viajar por el
  // endpoint de transformación. El día que esas imágenes se suban al bucket,
  // solo cambia el valor de la columna: ni una línea de este archivo.
  if (path.startsWith('/') || path.startsWith('http') || path.startsWith('data:')) {
    return path
  }

  return imageUrl(SUPABASE_URL, path, bucket, transform)
}

/**
 * Marcador para una ficha sin fotografía todavía. Es un SVG inline en negro
 * editorial: encaja con el marco de la tarjeta en lugar de romper la retícula
 * con un hueco blanco.
 */
export const PLACEHOLDER =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#0A0A0A"/></svg>',
  )
