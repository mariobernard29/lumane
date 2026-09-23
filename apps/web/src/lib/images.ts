import { BUCKETS, imageUrl, type BucketName } from '@lumane/db'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

/**
 * Convierte el `storage_path` guardado en la base en una URL servible.
 *
 * Devuelve el objeto tal cual: la transformación en servidor de Supabase es un
 * complemento de pago que este proyecto no tiene. Quien la necesite la resuelve
 * por su cuenta — la web con `next/image`, que además ya lo hacía.
 */
export function storageUrl(
  path: string | null | undefined,
  bucket: BucketName = BUCKETS.products,
): string {
  if (!path) return PLACEHOLDER

  // Escape hatch deliberado: una ruta que empieza por "/" es un recurso local
  // de `public/`. Es lo que permitió que las doce fotos del prototipo
  // funcionaran durante meses sin Storage, y lo que hizo que migrarlas fuera
  // solo cambiar el valor de una columna, sin tocar una línea de aquí. Lo
  // siguen usando el logotipo y cualquier recurso que no tenga por qué
  // viajar por la red.
  if (path.startsWith('/') || path.startsWith('http') || path.startsWith('data:')) {
    return path
  }

  return imageUrl(SUPABASE_URL, path, bucket)
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
