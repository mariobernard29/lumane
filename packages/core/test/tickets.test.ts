/**
 * Las plantillas del papel, comprobadas sin impresora.
 *
 *     pnpm --filter @lumane/core test
 *
 * Lo que importa en un rollo de 58 mm es que nada pase del ancho —la
 * impresora parte la línea donde quiere y el ticket se vuelve ilegible— y que
 * lo que dice el papel sea lo que se cobró.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildCorteTicket,
  buildSaleTicket,
  buildTestTicket,
  EscPosBuilder,
  leerTicket,
  LOGO_TICKET,
  ticketComoTexto,
  type CorteData,
  type LineaLeída,
  type TicketData,
  type TicketHeader,
} from '../src/index.ts'

const header: TicketHeader = {
  storeName: 'LUMANE',
  logo: LOGO_TICKET,
  locationName: 'Boutique Centro',
  addressLines: ['Av. Revolución 1234, Col. Centro', 'Culiacán, Sinaloa, C.P. 80000'],
  phone: '667 123 4567',
  whatsapp: '667 765 4321',
  socials: ['IG @lumane', 'FB /lumane', 'TikTok @lumane'],
  website: 'lumane.mx',
}

const venta: TicketData = {
  header,
  orderNumber: 'LM-20512',
  placedAt: new Date('2026-10-01T18:30:00Z'),
  cashierName: 'Mariana Fernández Castañeda',
  customerName: 'Sofía',
  lines: [
    {
      productName: 'Suéter de punto trenzado con cuello alto',
      variantTitle: 'Marfil / M',
      sku: 'SW-001-M',
      quantity: 2,
      unitPriceCents: 129900,
      discountCents: 10000,
      totalCents: 249800,
    },
    {
      productName: 'Aretes',
      variantTitle: null,
      sku: 'AR-01',
      quantity: 1,
      unitPriceCents: 35000,
      discountCents: 0,
      totalCents: 35000,
    },
  ],
  subtotalCents: 294800,
  discountCents: 10000,
  taxCents: 39282,
  totalCents: 284800,
  taxRate: 0.16,
  payments: [
    { method: 'cash', amountCents: 200000, tenderedCents: 250000, changeCents: 50000, reference: null },
    { method: 'card', amountCents: 84800, tenderedCents: null, changeCents: null, reference: 'AUT 123456' },
  ],
  changeCents: 50000,
  footerLines: ['¡Gracias por tu compra!'],
  reprintedAt: null,
}

/** Columnas que caben con el formato de la línea, en un rollo de 58 mm. */
function cabe(l: LineaLeída): number {
  const base = l.font === 'B' ? 42 : 32
  return l.size === 2 ? base / 2 : base
}

function sinDesbordes(bytes: Uint8Array) {
  for (const l of leerTicket(bytes)) {
    if (l.text.startsWith('[imagen')) continue
    assert.ok(l.text.length <= cabe(l), `"${l.text}" (${l.text.length}) no cabe en ${cabe(l)}`)
  }
}

test('el ticket de venta no pasa del ancho de 58 mm', () => {
  sinDesbordes(buildSaleTicket(venta, { corte: 'manual' }))
})

test('el ticket empieza con el logo y lleva contacto, redes y pie', () => {
  const líneas = leerTicket(buildSaleTicket(venta))
  assert.equal(líneas[0]!.text, '[imagen 384x51]')

  const texto = líneas.map((l) => l.text).join('\n')
  assert.match(texto, /Tel 667 123 4567/)
  assert.match(texto, /WhatsApp 667 765 4321/)
  assert.match(texto, /IG @lumane · FB \/lumane · TikTok @lumane/)
  assert.match(texto, /lumane\.mx/)
  assert.match(texto, /¡Gracias por tu compra!/)
  assert.match(texto, /Suéter de punto/)
  assert.doesNotMatch(texto, /REIMPRESIÓN/)
})

test('el total va en doble alto y negrita', () => {
  const total = leerTicket(buildSaleTicket(venta)).find((l) => l.text.startsWith('TOTAL'))
  assert.ok(total)
  assert.equal(total.size, 'alto')
  assert.equal(total.bold, true)
  assert.match(total.text, /\$2,848\.00$/)
})

test('la reimpresión lo dice', () => {
  const texto = ticketComoTexto(buildSaleTicket({ ...venta, reprintedAt: new Date() }))
  assert.match(texto, /\*\*\* REIMPRESIÓN \*\*\*/)
})

test('sin logo, el nombre de la tienda va en texto', () => {
  const líneas = leerTicket(buildSaleTicket({ ...venta, header: { ...header, logo: null } }))
  assert.equal(líneas[0]!.text, 'LUMANE')
  assert.equal(líneas[0]!.size, 2)
})

test('corte manual no manda la orden de cuchilla', () => {
  const manual = buildSaleTicket(venta, { corte: 'manual' })
  const auto = buildSaleTicket(venta, { corte: 'auto' })
  const tieneCorte = (b: Uint8Array) => b.some((x, i) => x === 0x1d && b[i + 1] === 0x56)
  assert.equal(tieneCorte(manual), false)
  assert.equal(tieneCorte(auto), true)
})

test('las imágenes se mandan como GS v 0 con el tamaño correcto', () => {
  const bytes = new EscPosBuilder().image(LOGO_TICKET).build()
  assert.deepEqual([...bytes.subarray(0, 8)], [0x1d, 0x76, 0x30, 0, 48, 0, 51, 0])
  assert.equal(bytes.length, 8 + 48 * 51)
})

test('una imagen alta se parte en franjas', () => {
  const alta = { width: 16, height: 300, data: new Uint8Array(2 * 300) }
  const bytes = new EscPosBuilder().image(alta).build()
  // 128 + 128 + 44 filas = 3 cabeceras de 8 bytes.
  assert.equal(bytes.length, 3 * 8 + 2 * 300)
  assert.equal(leerTicket(bytes)[0]!.text, '[imagen 16x300]')
})

test('la fuente B llena más columnas', () => {
  const t = new EscPosBuilder(32)
  assert.equal(t.width, 32)
  t.font('B')
  assert.equal(t.width, 42)
  t.init()
  assert.equal(t.width, 32)
})

const corte: CorteData = {
  header,
  partial: false,
  openedAt: new Date('2026-10-01T16:00:00Z'),
  openedByName: 'Mariana Fernández',
  closedAt: new Date('2026-10-02T03:00:00Z'),
  closedByName: 'Mariana Fernández',
  openingFloatCents: 100000,
  salesCount: 7,
  salesTotalCents: 1234500,
  byMethod: [
    { method: 'cash', amountCents: 534500, count: 4 },
    { method: 'card', amountCents: 700000, count: 3 },
  ],
  cashInCents: 0,
  cashOutCents: 20000,
  expectedCashCents: 614500,
  countedCashCents: 610000,
  differenceCents: -4500,
  notes: 'Se pagó el garrafón de agua con efectivo de la caja.',
  reprintedAt: null,
}

test('el corte no pasa del ancho y marca el faltante', () => {
  const bytes = buildCorteTicket(corte, { corte: 'manual' })
  sinDesbordes(bytes)

  const líneas = leerTicket(bytes)
  const faltante = líneas.find((l) => l.text.startsWith('FALTANTE'))
  assert.ok(faltante)
  assert.match(faltante.text, /-45\.00$/)
  assert.ok(líneas.some((l) => l.text === 'Cajera'))
})

test('el corte parcial dice que no cierra la caja y no lleva firmas', () => {
  const texto = ticketComoTexto(
    buildCorteTicket({ ...corte, partial: true, countedCashCents: null, differenceCents: null }),
  )
  assert.match(texto, /CORTE PARCIAL/)
  assert.match(texto, /No cierra la caja/)
  assert.doesNotMatch(texto, /FALTANTE|SOBRANTE/)
  assert.doesNotMatch(texto, /Cajera/)
})

test('la página de prueba no pasa del ancho', () => {
  sinDesbordes(buildTestTicket(header, { corte: 'manual' }))
})
