/**
 * Las variantes de una prenda: de las opciones (talla, color, tamaño) a la
 * lista de combinaciones con su código.
 *
 * Una camisa con código base `1234`, tallas Chica y Mediana y color Negro da
 * dos variantes: `1234-CH-NEG` y `1234-M-NEG`. El sufijo vive en cada VALOR y
 * no en la variante: así una talla nueva genera sus códigos sola y no hay que
 * teclear uno por combinación.
 *
 * Puro a propósito: lo usa la pantalla para previsualizar mientras se teclea,
 * y lo que se guarda lo vuelve a comprobar `pos_save_product` en la base.
 */

export interface ValorOpcion {
  value: string
  /** Sufijo en el SKU: `CH`, `NEG`. */
  code: string
}

export interface OpcionProducto {
  name: string
  values: ValorOpcion[]
}

export interface VarianteEditable {
  /** El id en la base, si ya existía. */
  id: string | null
  /** Un valor por opción, en el orden de las opciones. */
  values: string[]
  sku: string
  barcode: string | null
  priceCents: number
  compareAtPriceCents: number | null
  isActive: boolean
}

/**
 * Sufijos que ya tienen un uso establecido en la tienda. Lo demás se abrevia
 * con la regla general de `sugerirCodigo`.
 */
const CONOCIDOS: Record<string, string> = {
  'extra chica': 'XCH',
  'extra chico': 'XCH',
  chica: 'CH',
  chico: 'CH',
  mediana: 'M',
  mediano: 'M',
  grande: 'G',
  'extra grande': 'XG',
  unitalla: 'UT',
  'talla unica': 'UT',
  xs: 'XS',
  s: 'S',
  m: 'M',
  l: 'L',
  xl: 'XL',
  xxl: 'XXL',
}

/** Presets que la pantalla ofrece con un toque, en este orden. */
export const PRESETS_OPCIONES: Record<string, string[]> = {
  Talla: ['Chica', 'Mediana', 'Grande', 'Extra grande'],
  Color: ['Negro', 'Blanco', 'Beige', 'Rojo', 'Azul'],
  Tamaño: ['Chico', 'Mediano', 'Grande'],
}

export function sinAcentos(valor: string): string {
  return valor.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * El sufijo que se propone para un valor. Siempre editable: es una
 * sugerencia, no una regla.
 *
 *  - Los conocidos: Chica → CH, Extra grande → XG.
 *  - Números tal cual: 28 → 28.
 *  - Una palabra: sus tres primeras letras. Negro → NEG.
 *  - Varias: la inicial de cada una, hasta tres. Azul marino → AM.
 */
export function sugerirCodigo(valor: string): string {
  const limpio = sinAcentos(valor).trim().toLowerCase().replace(/\s+/g, ' ')
  if (limpio === '') return ''

  const conocido = CONOCIDOS[limpio]
  if (conocido) return conocido

  const palabras = limpio.split(' ').map((p) => p.replace(/[^a-z0-9]/g, '')).filter(Boolean)
  if (palabras.length === 0) return ''
  if (palabras.length === 1) {
    const p = palabras[0]!
    return (/^\d+$/.test(p) ? p : p.slice(0, 3)).toUpperCase()
  }
  return palabras
    .slice(0, 3)
    .map((p) => p[0]!)
    .join('')
    .toUpperCase()
}

/** Solo letras, números y guiones, en mayúsculas: lo que cabe en una etiqueta. */
export function normalizarCodigo(codigo: string): string {
  return sinAcentos(codigo)
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
}

/** `1234` + [`CH`, `NEG`] → `1234-CH-NEG`. Los sufijos vacíos se saltan. */
export function skuDeVariante(base: string, codigos: string[]): string {
  return [normalizarCodigo(base), ...codigos.map(normalizarCodigo)].filter(Boolean).join('-')
}

/** Todas las combinaciones de valores, en el orden de las opciones. */
export function combinaciones(opciones: OpcionProducto[]): string[][] {
  const conValores = opciones.filter((o) => o.values.length > 0)
  if (conValores.length === 0) return [[]]
  return conValores.reduce<string[][]>(
    (acc, opcion) => acc.flatMap((combo) => opcion.values.map((v) => [...combo, v.value])),
    [[]],
  )
}

function clave(values: string[]): string {
  return values.map((v) => v.trim().toLowerCase()).join('\u0000')
}

/**
 * La lista de variantes que corresponde a las opciones actuales.
 *
 * Conserva lo que ya existía —id, precio, si estaba activa, código de
 * barras— cuando la combinación sigue existiendo; las nuevas toman el precio
 * base.
 *
 * El SKU de una variante NUEVA siempre se recalcula: si cambia el código base
 * o un sufijo, cambian todas a la vez. El de una variante ya GUARDADA se
 * conserva salvo que se pida `regenerar`: puede estar impreso en etiquetas, y
 * cambiarlo por corregir una falta en el nombre de un color sería una sorpresa.
 *
 * Una prenda sin opciones tiene UNA variante, con el código base como SKU.
 */
export function planearVariantes(
  base: string,
  opciones: OpcionProducto[],
  existentes: VarianteEditable[],
  precioBase: { priceCents: number; compareAtPriceCents: number | null },
  regenerar = false,
): VarianteEditable[] {
  const sku = (previa: VarianteEditable | undefined, calculado: string) =>
    previa?.id && !regenerar ? previa.sku : calculado

  const usadas = opciones.filter((o) => o.values.length > 0)
  const porClave = new Map(existentes.map((v) => [clave(v.values), v]))

  // Sin opciones, la única variante es la que hubiera (sin valores) o, si la
  // prenda tenía opciones y se quitaron todas, la primera que existía.
  if (usadas.length === 0) {
    const previa = porClave.get(clave([])) ?? existentes[0]
    return [
      {
        id: previa?.id ?? null,
        values: [],
        sku: sku(previa, skuDeVariante(base, [])),
        barcode: previa?.barcode ?? null,
        priceCents: previa?.priceCents ?? precioBase.priceCents,
        compareAtPriceCents: previa ? previa.compareAtPriceCents : precioBase.compareAtPriceCents,
        isActive: previa?.isActive ?? true,
      },
    ]
  }

  return combinaciones(usadas).map((values) => {
    const previa = porClave.get(clave(values))
    const codigos = values.map((valor, i) => {
      const v = usadas[i]!.values.find((x) => x.value === valor)
      return v?.code || sugerirCodigo(valor)
    })
    return {
      id: previa?.id ?? null,
      values,
      sku: sku(previa, skuDeVariante(base, codigos)),
      barcode: previa?.barcode ?? null,
      priceCents: previa?.priceCents ?? precioBase.priceCents,
      compareAtPriceCents: previa ? previa.compareAtPriceCents : precioBase.compareAtPriceCents,
      isActive: previa?.isActive ?? true,
    }
  })
}

/** SKU repetidos dentro de la misma prenda: dos valores con el mismo sufijo. */
export function skusRepetidos(variantes: VarianteEditable[]): string[] {
  const vistos = new Set<string>()
  const repetidos = new Set<string>()
  for (const v of variantes) {
    if (vistos.has(v.sku)) repetidos.add(v.sku)
    vistos.add(v.sku)
  }
  return [...repetidos]
}
