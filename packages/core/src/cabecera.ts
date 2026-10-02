/**
 * La cabecera común a todo lo que sale de la impresora: ticket de venta,
 * corte de caja, página de prueba.
 *
 * Vive aparte para que los tres papeles sean reconocibles como de la misma
 * tienda sin copiar la plantilla tres veces.
 */
import type { EscPosBuilder, RasterImage } from './escpos.ts'

export interface TicketHeader {
  /** Respaldo en texto cuando no hay logo. */
  storeName: string
  /** El logotipo en 1 bit; `null` imprime `storeName` en grande. */
  logo: RasterImage | null
  locationName: string
  addressLines: string[]
  phone: string | null
  whatsapp: string | null
  /** Ya formateadas para el papel: `IG @lumane`, `FB /lumane`… */
  socials: string[]
  website: string | null
}

const FECHA_HORA = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Mazatlan',
})

export function formatFechaHora(fecha: Date): string {
  return FECHA_HORA.format(fecha)
}

/**
 * Logo, sucursal y datos de contacto, centrados. Deja la impresora en fuente
 * A, alineada a la izquierda y sin negrita.
 *
 * `completa: false` es para los papeles internos (el corte): basta con saber
 * de qué tienda y sucursal son; las redes no le sirven a nadie ahí.
 */
export function imprimirCabecera(t: EscPosBuilder, h: TicketHeader, completa = true): void {
  t.align('center')

  if (h.logo) {
    t.image(h.logo).feed(1)
  } else {
    t.bold(true).size(2).line(h.storeName).size(1).bold(false)
  }

  t.line(h.locationName)
  if (!completa) {
    t.align('left')
    return
  }

  for (const línea of h.addressLines) t.wrap(línea)

  // El mismo número dos veces gasta una línea y parece un error.
  const contacto =
    h.phone && h.phone === h.whatsapp
      ? [`Tel y WhatsApp ${h.phone}`]
      : [h.phone && `Tel ${h.phone}`, h.whatsapp && `WhatsApp ${h.whatsapp}`].filter(
          (x): x is string => Boolean(x),
        )
  // Juntos si caben en una línea; si no, uno por línea.
  const juntos = contacto.join('  ')
  if (juntos.length <= t.width) {
    if (juntos) t.line(juntos)
  } else {
    for (const c of contacto) t.line(c)
  }

  if (h.socials.length > 0 || h.website) {
    t.font('B')
    if (h.socials.length > 0) t.wrap(h.socials.join(' · '))
    if (h.website) t.line(h.website)
    t.font('A')
  }

  t.align('left')
}

/**
 * La banda que distingue una copia del original. Un ticket reimpreso que no
 * lo dice sirve para cobrar dos veces una devolución.
 */
export function imprimirBandaReimpresion(t: EscPosBuilder, cuando: Date): void {
  t.align('center').bold(true).line('*** REIMPRESIÓN ***').bold(false)
  t.font('B').line(formatFechaHora(cuando)).font('A').align('left')
}
