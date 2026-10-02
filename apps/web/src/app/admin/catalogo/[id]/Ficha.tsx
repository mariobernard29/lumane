'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { BUCKETS } from '@lumane/db'

import {
  guardarAltDeFoto,
  guardarProducto,
  guardarVariante,
  quitarFoto,
  registrarFoto,
} from '@/actions/admin/catalogo'
import { ImagePicker } from '@/components/admin/ImagePicker'
import {
  FormRow,
  SaveBar,
  Select,
  StatusNote,
  TextArea,
  TextInput,
  Toggle,
} from '@/components/admin/primitivos'
import { storageUrl } from '@/lib/images'

/**
 * La ficha de una prenda.
 *
 * Tres bloques en el orden en que se trabaja: qué es y si se ve, luego sus
 * tallas con sus precios, y al final las fotos.
 *
 * **Los precios se escriben en pesos y se guardan en centavos.** La conversión
 * la hace la acción del servidor, no este formulario: teclear «1,299.50» tiene
 * que funcionar, y el redondeo de dinero no se decide en el navegador.
 */

export interface VarianteUI {
  id: string
  title: string
  sku: string
  barcode: string | null
  price_cents: number
  compare_at_price_cents: number | null
  is_active: boolean
  position: number
  disponible: number | null
}

export interface FotoUI {
  id: string
  storage_path: string
  alt_text: string
  position: number
}

export interface ProductoUI {
  id: string
  name: string
  slug: string
  short_description: string | null
  long_description: string | null
  fit_note: string | null
  materials: string | null
  care: string | null
  brand: string | null
  status: string
  is_online: boolean
  primary_category_id: string | null
  seo_title: string | null
  seo_description: string | null
  variantes: VarianteUI[]
  fotos: FotoUI[]
}

/** Centavos a pesos para rellenar un campo. Vacío si no hay valor. */
function aPesos(centavos: number | null | undefined): string {
  if (centavos == null) return ''
  return (Number(centavos) / 100).toFixed(2)
}

export function Ficha({
  producto,
  categorias,
}: {
  producto: ProductoUI
  categorias: { id: string; name: string }[]
}) {
  const [aviso, setAviso] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()

  function correr(fn: () => Promise<{ ok: boolean; mensaje: string }>) {
    empezar(async () => {
      const r = await fn()
      if (r.mensaje) setAviso(r.mensaje)
    })
  }

  return (
    <div className="grid gap-10">
      {aviso ? <StatusNote>{aviso}</StatusNote> : null}

      {/* ---------------- La prenda ---------------- */}
      <form action={(fd) => correr(() => guardarProducto(fd))} className="grid gap-2">
        <input type="hidden" name="id" value={producto.id} />
        <h2 className="font-headline-sm text-headline-sm text-primary">La prenda</h2>

        <FormRow label="Nombre" htmlFor="name">
          <TextInput id="name" name="name" defaultValue={producto.name} required />
        </FormRow>

        <FormRow
          label="Dirección en la tienda"
          htmlFor="slug"
          hint="Lo que va después de /producto/. Cambiarla rompe los enlaces que ya se hayan compartido."
        >
          <TextInput id="slug" name="slug" defaultValue={producto.slug} required />
        </FormRow>

        <FormRow
          label="Descripción corta"
          htmlFor="shortDescription"
          hint="La línea que acompaña al nombre en la retícula del catálogo."
        >
          <TextInput
            id="shortDescription"
            name="shortDescription"
            defaultValue={producto.short_description ?? ''}
          />
        </FormRow>

        <FormRow label="Descripción" htmlFor="longDescription">
          <TextArea
            id="longDescription"
            name="longDescription"
            defaultValue={producto.long_description ?? ''}
          />
        </FormRow>

        <FormRow
          label="Nota de talla"
          htmlFor="fitNote"
          hint="«Queda holgado», «pide una talla menos». Lo que evita una devolución."
        >
          <TextInput id="fitNote" name="fitNote" defaultValue={producto.fit_note ?? ''} />
        </FormRow>

        <FormRow label="Composición" htmlFor="materials" hint="Un material por renglón: «Algodón 95%».">
          <TextArea id="materials" name="materials" defaultValue={producto.materials ?? ''} />
        </FormRow>

        <FormRow
          label="Cuidados"
          htmlFor="care"
          hint="Un cuidado por renglón. Vacío, la ficha enseña las indicaciones generales."
        >
          <TextArea id="care" name="care" defaultValue={producto.care ?? ''} />
        </FormRow>

        <FormRow label="Marca" htmlFor="brand">
          <TextInput id="brand" name="brand" defaultValue={producto.brand ?? ''} />
        </FormRow>

        <FormRow label="Categoría" htmlFor="primaryCategoryId">
          <Select
            id="primaryCategoryId"
            name="primaryCategoryId"
            defaultValue={producto.primary_category_id ?? ''}
          >
            <option value="">Sin categoría</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormRow>

        <FormRow
          label="Estado"
          htmlFor="status"
          hint="Solo las publicadas se ven en la tienda. Archivar la esconde sin borrar su historial de ventas."
        >
          <Select id="status" name="status" defaultValue={producto.status}>
            <option value="draft">Borrador</option>
            <option value="active">Publicada</option>
            <option value="archived">Archivada</option>
          </Select>
        </FormRow>

        <Toggle
          name="isOnline"
          defaultChecked={producto.is_online}
          label="Se vende en línea"
          hint="Desmárcalo para una prenda que solo está en el mostrador."
        />

        <h3 className="mt-4 font-label-upper text-label-upper text-secondary">Buscadores</h3>
        <FormRow label="Título" htmlFor="seoTitle">
          <TextInput id="seoTitle" name="seoTitle" defaultValue={producto.seo_title ?? ''} />
        </FormRow>
        <FormRow label="Descripción" htmlFor="seoDescription">
          <TextArea
            id="seoDescription"
            name="seoDescription"
            defaultValue={producto.seo_description ?? ''}
          />
        </FormRow>

        <SaveBar />
      </form>

      {/* ---------------- Variantes ---------------- */}
      <section className="grid gap-3">
        <div className="grid gap-1">
          <h2 className="font-headline-sm text-headline-sm text-primary">Tallas y precios</h2>
          <p className="font-body-md text-body-md text-text-muted">
            El precio incluye IVA. El inventario no se edita aquí: se ajusta desde la tablet, en
            Inventario, para que cada cambio quede con su motivo.
          </p>
        </div>

        {producto.variantes.map((v) => (
          <form
            key={v.id}
            action={(fd) => correr(() => guardarVariante(fd))}
            className="grid gap-3 border border-outline-variant bg-paper-bright p-3 sm:grid-cols-2"
          >
            <input type="hidden" name="id" value={v.id} />
            <input type="hidden" name="productId" value={producto.id} />
            <input type="hidden" name="position" value={v.position} />

            <div className="grid gap-1">
              <span className="font-label-upper text-label-upper text-secondary">Talla o variante</span>
              <TextInput name="title" defaultValue={v.title} required />
            </div>
            <div className="grid gap-1">
              <span className="font-label-upper text-label-upper text-secondary">SKU</span>
              <TextInput name="sku" defaultValue={v.sku} required />
            </div>
            <div className="grid gap-1">
              <span className="font-label-upper text-label-upper text-secondary">Precio</span>
              <TextInput name="price" inputMode="decimal" defaultValue={aPesos(v.price_cents)} required />
            </div>
            <div className="grid gap-1">
              <span className="font-label-upper text-label-upper text-secondary">
                Precio anterior
              </span>
              <TextInput
                name="compareAt"
                inputMode="decimal"
                placeholder="Vacío si no está en rebaja"
                defaultValue={aPesos(v.compare_at_price_cents)}
              />
            </div>
            <div className="grid gap-1">
              <span className="font-label-upper text-label-upper text-secondary">
                Código de barras
              </span>
              <TextInput name="barcode" defaultValue={v.barcode ?? ''} />
            </div>

            <div className="grid content-end gap-2">
              <p className="font-body-md text-body-md text-text-muted">
                {v.disponible === null
                  ? 'Sin inventario registrado'
                  : `${v.disponible} disponible${v.disponible === 1 ? '' : 's'}`}
              </p>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 font-body-md text-body-md text-primary">
                  <input
                    type="checkbox"
                    name="isActive"
                    defaultChecked={v.is_active}
                    className="size-5 accent-primary"
                  />
                  A la venta
                </label>
                <button
                  type="submit"
                  disabled={pendiente}
                  className="border border-primary bg-primary px-5 py-2 font-label-upper text-label-upper text-on-primary disabled:opacity-40"
                >
                  Guardar
                </button>
              </div>
            </div>
          </form>
        ))}

        <form
          action={(fd) => correr(() => guardarVariante(fd))}
          className="grid gap-3 border border-dashed border-outline-variant p-3 sm:grid-cols-2"
        >
          <input type="hidden" name="productId" value={producto.id} />
          <input
            type="hidden"
            name="position"
            value={(producto.variantes.at(-1)?.position ?? -1) + 1}
          />
          <input type="hidden" name="isActive" value="on" />

          <div className="grid gap-1">
            <span className="font-label-upper text-label-upper text-secondary">Talla o variante</span>
            <TextInput name="title" placeholder="M" required />
          </div>
          <div className="grid gap-1">
            <span className="font-label-upper text-label-upper text-secondary">SKU</span>
            <TextInput name="sku" placeholder="VES-ENC-NEG-M" required />
          </div>
          <div className="grid gap-1">
            <span className="font-label-upper text-label-upper text-secondary">Precio</span>
            <TextInput name="price" inputMode="decimal" placeholder="1299.00" required />
          </div>
          <div className="grid gap-1">
            <span className="font-label-upper text-label-upper text-secondary">Precio anterior</span>
            <TextInput name="compareAt" inputMode="decimal" placeholder="Opcional" />
          </div>
          <div className="grid gap-1">
            <span className="font-label-upper text-label-upper text-secondary">Código de barras</span>
            <TextInput name="barcode" />
          </div>
          <div className="grid content-end">
            <button
              type="submit"
              disabled={pendiente}
              className="border border-primary px-5 py-2.5 font-label-upper text-label-upper text-primary disabled:opacity-40"
            >
              Añadir variante
            </button>
          </div>
        </form>
      </section>

      {/* ---------------- Fotos ---------------- */}
      <section className="grid gap-3">
        <div className="grid gap-1">
          <h2 className="font-headline-sm text-headline-sm text-primary">Fotos</h2>
          <p className="font-body-md text-body-md text-text-muted">
            La primera es la portada de la prenda en el catálogo.
          </p>
        </div>

        <ul className="grid gap-2">
          {producto.fotos.map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-center gap-4 border border-outline-variant bg-paper-bright p-3"
            >
              <div className="relative size-20 shrink-0 bg-surface">
                <Image
                  src={storageUrl(f.storage_path, BUCKETS.products)}
                  alt=""
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </div>

              <div className="grid flex-1 gap-1">
                <span className="font-label-upper text-label-upper text-secondary">
                  Descripción para quien no la ve
                </span>
                <TextInput
                  defaultValue={f.alt_text}
                  placeholder="Vestido negro de encaje, manga larga"
                  disabled={pendiente}
                  onBlur={(e) => {
                    if (e.target.value.trim() !== f.alt_text) {
                      correr(() => guardarAltDeFoto(f.id, e.target.value))
                    }
                  }}
                />
              </div>

              <button
                type="button"
                disabled={pendiente}
                onClick={() => correr(() => quitarFoto(f.id))}
                className="font-label-upper text-label-upper text-text-muted underline disabled:opacity-40"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>

        <ImagePicker
          valor={null}
          bucket={BUCKETS.products}
          prefijo={producto.id}
          etiqueta="Añadir una foto"
          ayuda="Se encoge sola antes de subir. Puedes tomarla con la cámara de la tablet."
          onSubida={(path) => correr(() => registrarFoto(producto.id, path, ''))}
        />
      </section>
    </div>
  )
}
