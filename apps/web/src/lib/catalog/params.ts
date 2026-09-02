/**
 * El estado del catálogo vive en la URL.
 *
 * No en `useState`: así los filtros funcionan sin JavaScript, la clienta puede
 * mandarle a una amiga "los vestidos negros talla S" por WhatsApp, el botón
 * "atrás" hace lo que debe y Google puede indexar cada combinación relevante.
 *
 * Forma de la URL:
 *   /catalogo/vestidos?talla=S,M&color=Negro&orden=precio-asc&pagina=2
 */

export const PAGE_SIZE = 9

export const SORT_OPTIONS = [
  { value: 'featured', label: 'Destacados', param: 'destacados' },
  { value: 'newest', label: 'Novedades', param: 'novedades' },
  { value: 'price_asc', label: 'Precio: menor a mayor', param: 'precio-asc' },
  { value: 'price_desc', label: 'Precio: mayor a menor', param: 'precio-desc' },
] as const

export const SALE_SORT_OPTIONS = [
  { value: 'discount', label: 'Mayor descuento', param: 'descuento' },
  { value: 'newest', label: 'Novedades en rebaja', param: 'novedades' },
  { value: 'price_asc', label: 'Precio: menor a mayor', param: 'precio-asc' },
  { value: 'price_desc', label: 'Precio: mayor a menor', param: 'precio-desc' },
] as const

export interface CatalogParams {
  sizes: string[]
  colors: string[]
  sort: string
  page: number
  query: string | null
}

/** Los `searchParams` de Next llegan como string o array; se normalizan aquí. */
type RawParams = Record<string, string | string[] | undefined>

function firstValue(raw: RawParams, key: string): string | null {
  const value = raw[key]
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function listValue(raw: RawParams, key: string): string[] {
  const value = firstValue(raw, key)
  if (!value) return []
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

export function parseCatalogParams(
  raw: RawParams,
  allowedSorts: readonly { value: string; param: string }[] = SORT_OPTIONS,
): CatalogParams {
  const sortParam = firstValue(raw, 'orden')
  const match = allowedSorts.find((o) => o.param === sortParam)
  const pageRaw = Number.parseInt(firstValue(raw, 'pagina') ?? '1', 10)

  return {
    sizes: listValue(raw, 'talla'),
    colors: listValue(raw, 'color'),
    sort: match?.value ?? allowedSorts[0]!.value,
    // Una página inválida (`?pagina=-3`, `?pagina=abc`) vuelve a la primera en
    // lugar de reventar la consulta con un offset negativo.
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
    query: firstValue(raw, 'q'),
  }
}

interface BuildOptions {
  basePath: string
  params: CatalogParams
  allowedSorts?: readonly { value: string; param: string }[]
  /** Cambios a aplicar sobre el estado actual. */
  overrides?: Partial<CatalogParams>
}

/**
 * Construye una URL del catálogo.
 *
 * Cualquier cambio de filtro devuelve a la página 1: quedarse en la 4 tras
 * filtrar suele dejar a la clienta mirando un vacío.
 */
export function buildCatalogHref({
  basePath,
  params,
  allowedSorts = SORT_OPTIONS,
  overrides = {},
}: BuildOptions): string {
  const next = { ...params, ...overrides }
  const changedFilters =
    overrides.sizes !== undefined || overrides.colors !== undefined || overrides.query !== undefined
  const page = overrides.page ?? (changedFilters ? 1 : next.page)

  const search = new URLSearchParams()
  if (next.query) search.set('q', next.query)
  if (next.sizes.length > 0) search.set('talla', next.sizes.join(','))
  if (next.colors.length > 0) search.set('color', next.colors.join(','))

  const sortParam = allowedSorts.find((o) => o.value === next.sort)?.param
  if (sortParam && sortParam !== allowedSorts[0]!.param) search.set('orden', sortParam)

  if (page > 1) search.set('pagina', String(page))

  const qs = search.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

/** Añade o quita un valor de una lista de filtros (talla, color). */
export function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}
