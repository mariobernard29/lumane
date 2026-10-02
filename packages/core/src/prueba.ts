/**
 * La página de prueba de la impresora y un lector de bytes ESC/POS.
 *
 * La página de prueba sirve para calibrar a ojo, con el rollo en la mano: si
 * la regla de 32 caracteres cabe justa, si los acentos salen, si el logo está
 * centrado. El lector hace lo inverso —bytes a texto— para comprobar las
 * plantillas sin impresora y para ver en consola lo que se va a imprimir.
 */
import { imprimirCabecera, formatFechaHora, type TicketHeader } from './cabecera.ts'
import { EscPosBuilder } from './escpos.ts'
import type { TicketOptions } from './ticket.ts'

export function buildTestTicket(header: TicketHeader, options: TicketOptions = {}): Uint8Array {
  const t = new EscPosBuilder(options.width ?? 32, { corte: options.corte })

  t.init()
  imprimirCabecera(t, header)
  t.rule('=')

  t.align('center').bold(true).line('PÁGINA DE PRUEBA').bold(false)
  t.line(formatFechaHora(new Date())).align('left')
  t.rule()

  t.line('Fuente A, 32 columnas:')
  t.line('1234567890'.repeat(4).slice(0, t.width))
  t.font('B')
  t.line('Fuente B, letra pequeña:')
  t.line('1234567890'.repeat(7).slice(0, t.width))
  t.font('A')
  t.rule()

  t.line('Acentos: áéíóú ÁÉÍÓÚ ñÑ ü ¿¡')
  t.bold(true).line('Negrita').bold(false)
  t.size('alto').line('Doble alto').size(1)
  t.columns('Columnas', '$1,234.56')
  t.rule()

  t.align('center').line('Si lees esto completo,').line('la impresora quedó lista.').align('left')

  return t.cut().build()
}

export interface LineaLeída {
  text: string
  font: 'A' | 'B'
  bold: boolean
  /** 1 normal, 2 doble ancho y alto, 'alto' solo doble alto. */
  size: 1 | 2 | 'alto'
  align: 'left' | 'center' | 'right'
}

const DESDE_CP850 = new Map<number, string>([
  [0xa0, 'á'], [0x82, 'é'], [0xa1, 'í'], [0xa2, 'ó'], [0xa3, 'ú'],
  [0xb5, 'Á'], [0x90, 'É'], [0xd6, 'Í'], [0xe0, 'Ó'], [0xe9, 'Ú'],
  [0xa4, 'ñ'], [0xa5, 'Ñ'], [0x81, 'ü'], [0x9a, 'Ü'],
  [0xa8, '¿'], [0xad, '¡'], [0xf8, '°'], [0xfa, '·'],
  [0xae, '«'], [0xaf, '»'], [0xd5, '€'],
])

/**
 * Bytes ESC/POS a líneas de texto con su formato.
 *
 * Entiende exactamente los comandos que emite `EscPosBuilder`; una imagen se
 * lee como una línea `[imagen ANCHOxALTO]`. No es un emulador: es lo justo
 * para probar plantillas.
 */
export function leerTicket(bytes: Uint8Array): LineaLeída[] {
  const líneas: LineaLeída[] = []
  let font: 'A' | 'B' = 'A'
  let bold = false
  let size: 1 | 2 | 'alto' = 1
  let align: LineaLeída['align'] = 'left'
  let actual = ''

  const cerrar = () => {
    líneas.push({ text: actual, font, bold, size, align })
    actual = ''
  }

  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!
    if (b === 0x1b) {
      const cmd = bytes[++i]
      if (cmd === 0x40) {
        font = 'A'
        bold = false
        size = 1
        align = 'left'
      } else if (cmd === 0x74 || cmd === 0x45 || cmd === 0x4d || cmd === 0x61 || cmd === 0x64) {
        const n = bytes[++i]!
        if (cmd === 0x45) bold = n === 1
        if (cmd === 0x4d) font = n === 1 ? 'B' : 'A'
        if (cmd === 0x61) align = n === 1 ? 'center' : n === 2 ? 'right' : 'left'
        if (cmd === 0x64) {
          if (actual) cerrar()
          for (let k = 0; k < n; k++) cerrar()
        }
      } else if (cmd === 0x70) {
        i += 3
      }
    } else if (b === 0x1d) {
      const cmd = bytes[++i]
      if (cmd === 0x21) {
        const n = bytes[++i]!
        size = n === 0x11 ? 2 : n === 0x01 ? 'alto' : 1
      } else if (cmd === 0x56) {
        i += 2
      } else if (cmd === 0x76) {
        i += 2 // '0' y m
        const xL = bytes[++i]!
        const xH = bytes[++i]!
        const yL = bytes[++i]!
        const yH = bytes[++i]!
        const anchoBytes = xL + (xH << 8)
        const alto = yL + (yH << 8)
        i += anchoBytes * alto
        if (actual) cerrar()
        actual = `[imagen ${anchoBytes * 8}x${alto}]`
        cerrar()
      }
    } else if (b === 0x0a) {
      cerrar()
    } else {
      actual += DESDE_CP850.get(b) ?? String.fromCharCode(b)
    }
  }
  if (actual) cerrar()

  // Franjas consecutivas de una misma imagen se leen como una sola.
  const unidas: LineaLeída[] = []
  for (const l of líneas) {
    const previa = unidas[unidas.length - 1]
    const m = /^\[imagen (\d+)x(\d+)\]$/.exec(l.text)
    const mp = previa && /^\[imagen (\d+)x(\d+)\]$/.exec(previa.text)
    if (m && mp && m[1] === mp[1]) {
      previa.text = `[imagen ${m[1]}x${Number(mp[2]) + Number(m[2])}]`
    } else {
      unidas.push(l)
    }
  }
  return unidas
}

/** El ticket como texto plano, para depurar en consola. */
export function ticketComoTexto(bytes: Uint8Array): string {
  return leerTicket(bytes)
    .map((l) => l.text)
    .join('\n')
}
