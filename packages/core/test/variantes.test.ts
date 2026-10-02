import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  combinaciones,
  planearVariantes,
  skuDeVariante,
  skusRepetidos,
  sugerirCodigo,
  type OpcionProducto,
  type VarianteEditable,
} from '../src/index.ts'

test('sugiere los sufijos conocidos y abrevia el resto', () => {
  assert.equal(sugerirCodigo('Chica'), 'CH')
  assert.equal(sugerirCodigo('extra grande'), 'XG')
  assert.equal(sugerirCodigo('Mediana'), 'M')
  assert.equal(sugerirCodigo('Negro'), 'NEG')
  assert.equal(sugerirCodigo('Azul marino'), 'AM')
  assert.equal(sugerirCodigo('28'), '28')
  assert.equal(sugerirCodigo('Océano'), 'OCE')
  assert.equal(sugerirCodigo('  '), '')
})

test('el SKU es el código base más los sufijos', () => {
  assert.equal(skuDeVariante('1234', ['CH']), '1234-CH')
  assert.equal(skuDeVariante('1234', ['ch', 'neg']), '1234-CH-NEG')
  assert.equal(skuDeVariante('1234', []), '1234')
  assert.equal(skuDeVariante(' ab 12 ', ['', 'M']), 'AB12-M')
})

const tallaColor: OpcionProducto[] = [
  { name: 'Talla', values: [{ value: 'Chica', code: 'CH' }, { value: 'Mediana', code: 'M' }] },
  { name: 'Color', values: [{ value: 'Negro', code: 'NEG' }, { value: 'Blanco', code: 'BLA' }] },
]

test('combina todas las opciones en orden', () => {
  assert.deepEqual(combinaciones(tallaColor), [
    ['Chica', 'Negro'],
    ['Chica', 'Blanco'],
    ['Mediana', 'Negro'],
    ['Mediana', 'Blanco'],
  ])
  assert.deepEqual(combinaciones([]), [[]])
})

test('las variantes nuevas toman el precio base y su SKU', () => {
  const v = planearVariantes('1234', tallaColor, [], { priceCents: 59900, compareAtPriceCents: null })
  assert.equal(v.length, 4)
  assert.deepEqual(
    v.map((x) => x.sku),
    ['1234-CH-NEG', '1234-CH-BLA', '1234-M-NEG', '1234-M-BLA'],
  )
  assert.ok(v.every((x) => x.priceCents === 59900 && x.id === null && x.isActive))
})

test('conserva id, precio y SKU de las que ya estaban guardadas', () => {
  const existente: VarianteEditable = {
    id: 'v1',
    values: ['Chica', 'Negro'],
    sku: 'VIEJO-1',
    barcode: '750123',
    priceCents: 64900,
    compareAtPriceCents: 79900,
    isActive: false,
  }
  const v = planearVariantes('5678', tallaColor, [existente], { priceCents: 59900, compareAtPriceCents: null })
  const chicaNegro = v.find((x) => x.values.join() === 'Chica,Negro')!
  assert.equal(chicaNegro.id, 'v1')
  assert.equal(chicaNegro.sku, 'VIEJO-1')
  assert.equal(chicaNegro.priceCents, 64900)
  assert.equal(chicaNegro.compareAtPriceCents, 79900)
  assert.equal(chicaNegro.barcode, '750123')
  assert.equal(chicaNegro.isActive, false)
})

test('sin opciones hay una sola variante con el código base', () => {
  const v = planearVariantes('1234', [], [], { priceCents: 10000, compareAtPriceCents: null })
  assert.equal(v.length, 1)
  assert.equal(v[0]!.sku, '1234')
  assert.deepEqual(v[0]!.values, [])
})

test('detecta sufijos repetidos', () => {
  const opciones: OpcionProducto[] = [
    { name: 'Color', values: [{ value: 'Negro', code: 'NEG' }, { value: 'Negro mate', code: 'NEG' }] },
  ]
  const v = planearVariantes('1', opciones, [], { priceCents: 1, compareAtPriceCents: null })
  assert.deepEqual(skusRepetidos(v), ['1-NEG'])
})

test('regenerar recalcula también los SKU guardados', () => {
  const existente: VarianteEditable = {
    id: 'v1', values: ['Chica', 'Negro'], sku: 'VIEJO-1', barcode: null,
    priceCents: 1, compareAtPriceCents: null, isActive: true,
  }
  const v = planearVariantes('5678', tallaColor, [existente], { priceCents: 1, compareAtPriceCents: null }, true)
  assert.equal(v.find((x) => x.id === 'v1')!.sku, '5678-CH-NEG')
})

test('una variante sin guardar sigue al código base', () => {
  const editada: VarianteEditable = {
    id: null, values: ['Chica', 'Negro'], sku: '1-CH-NEG', barcode: null,
    priceCents: 777, compareAtPriceCents: null, isActive: true,
  }
  const v = planearVariantes('2', tallaColor, [editada], { priceCents: 1, compareAtPriceCents: null })
  const x = v.find((y) => y.values.join() === 'Chica,Negro')!
  assert.equal(x.sku, '2-CH-NEG')
  assert.equal(x.priceCents, 777)
})
