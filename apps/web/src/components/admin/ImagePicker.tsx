'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { BUCKETS, type BucketName } from '@lumane/db'

import { storageUrl } from '@/lib/images'
import { createBrowserSupabase } from '@/lib/supabase/client'

/**
 * Elegir, encoger y subir una imagen.
 *
 * **Se encoge en el navegador antes de subir, y no es un lujo.** El panel se
 * usa desde una tablet: una foto de su cámara pesa cuatro megas, y el bucket
 * de producto corta en cinco. Sin esto, la propietaria vería un error críptico
 * de Storage cada dos fotos, justo cuando está cargando el catálogo entero.
 *
 * Además convierte a WebP, que para una foto de prenda pesa entre un tercio y
 * la mitad que el JPEG original sin diferencia visible. Y encoger AQUÍ es la
 * única reducción que hay: la transformación en servidor de Supabase es un
 * complemento de pago que este proyecto no tiene, así que lo que se suba es lo
 * que se sirve. En la web, `next/image` vuelve a redimensionar por su cuenta.
 *
 * **Sube directo desde el navegador**, no por Server Action: pasar el archivo
 * por el servidor de Next para que él lo reenvíe es doble tránsito. La
 * autorización la hace la política de `storage.objects`, que exige el mismo
 * permiso que la tabla correspondiente. Lo que se guarda en la BASE —la ruta—
 * sí pasa por una acción de servidor.
 */

/** Lado largo máximo. Sobrado para una ficha de producto a pantalla completa. */
const LADO_MAXIMO = 2000
const CALIDAD = 0.82

async function encoger(archivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo)

  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height))
  const ancho = Math.round(bitmap.width * escala)
  const alto = Math.round(bitmap.height * escala)

  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto

  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('El navegador no pudo preparar la imagen')
  ctx.drawImage(bitmap, 0, 0, ancho, alto)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    lienzo.toBlob(resolve, 'image/webp', CALIDAD),
  )
  if (!blob) throw new Error('El navegador no pudo convertir la imagen')
  return blob
}

export function ImagePicker({
  valor,
  bucket = BUCKETS.content,
  prefijo,
  onSubida,
  etiqueta = 'Imagen',
  ayuda,
}: {
  /** La ruta guardada, o null. */
  valor: string | null
  bucket?: BucketName
  /** Carpeta dentro del bucket: `home`, o el id del producto. */
  prefijo: string
  onSubida: (path: string) => void
  etiqueta?: string
  ayuda?: string
}) {
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  async function elegida(archivo: File | undefined) {
    if (!archivo) return
    setSubiendo(true)
    setError(null)

    try {
      const blob = await encoger(archivo)

      // Nombre con uuid y no el del archivo: evita colisiones entre dos
      // «IMG_0421.jpg», acentos que Storage no acepta, y que el navegador
      // sirva la versión vieja en caché al reemplazar una foto.
      const path = `${prefijo}/${crypto.randomUUID()}.webp`

      const supabase = createBrowserSupabase()
      const { error: fallo } = await supabase.storage
        .from(bucket)
        .upload(path, blob, { contentType: 'image/webp', upsert: false })

      if (fallo) throw new Error(fallo.message)
      onSubida(path)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir la imagen')
    } finally {
      setSubiendo(false)
      // Se limpia para que elegir el MISMO archivo otra vez vuelva a disparar
      // el evento: sin esto, reintentar tras un fallo no hace nada.
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="grid gap-2 py-3 border-b border-surface-variant last:border-b-0">
      <span className="font-label-upper text-label-upper text-secondary">{etiqueta}</span>

      <div className="flex flex-wrap items-start gap-4">
        <div className="relative size-28 shrink-0 border border-outline-variant bg-surface">
          {valor ? (
            <Image
              src={storageUrl(valor, bucket)}
              alt=""
              fill
              sizes="112px"
              className="object-cover"
            />
          ) : (
            <span className="absolute inset-0 grid place-items-center font-body-md text-body-md text-text-muted">
              Sin foto
            </span>
          )}
        </div>

        <div className="grid gap-2">
          <input
            ref={input}
            type="file"
            accept="image/*"
            disabled={subiendo}
            onChange={(e) => void elegida(e.target.files?.[0])}
            className="font-body-md text-body-md text-secondary file:mr-3 file:border file:border-primary file:bg-paper-bright file:px-4 file:py-2 file:font-label-upper file:text-label-upper file:text-primary"
          />
          {subiendo ? (
            <p className="font-body-md text-body-md text-secondary">Subiendo…</p>
          ) : null}
          {ayuda ? <p className="font-body-md text-body-md text-text-muted">{ayuda}</p> : null}
          {error ? (
            <p className="border border-primary px-3 py-2 font-body-md text-body-md text-primary">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
