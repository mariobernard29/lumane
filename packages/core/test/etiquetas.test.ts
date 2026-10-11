/**
 * Las etiquetas de prenda, comprobadas sin etiquetadora.
 *
 * En una etiqueta lo que se rompe es la geometría: un texto que se sale del
 * borde no se imprime, y dos elementos encimados no se leen. Así que se lee el
 * TSPL de vuelta a cajas y se comprueba eso, en TODOS los tamaños del
 * catálogo y con los nombres más incómodos.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildEtiquetaPrueba,
  buildEtiquetas,
  FORMATOS_ETIQUETA,
  leerEtiqueta,
  modulosDeCodigo,
  precioEtiqueta,
  tipoDeCodigo,
  type DatosEtiqueta,
  type ElementoEtiqueta,
} from '../src/index.ts'

const PRENDAS: DatosEtiqueta[] = [
  { nombre: 'Vestido Midi Satinado', detalle: 'Mediana / Negro', precioCents: 189000, sku: '1001-M-NEG', codigoBarras: null, copias: 2 },
  {
    nombre: 'Conjunto estructurado de lino con botones dorados y cinturón',
    detalle: 'Extra grande / Azul marino',
    precioCents: 1249950,
    sku: '10234-XG-AM',
    codigoBarras: null,
    copias: 1,
  },
  { nombre: 'Bolso', detalle: null, precioCents: 320000, sku: '1003', codigoBarras: '7501234567893', copias: 1 },
]

function solapan(a: ElementoEtiqueta, b: ElementoEtiqueta): boolean {
  return a.x < b.x + b.ancho && b.x < a.x + a.ancho && a.y < b.y + b.alto && b.y < a.y + a.alto
}

for (const formato of FORMATOS_ETIQUETA) {
  test(`${formato.nombre}: todo dentro de la etiqueta y nada encimado`, () => {
    const { bytes } = buildEtiquetas(PRENDAS, formato)
    const leída = leerEtiqueta(bytes)

    assert.equal(leída.anchoPuntos, Math.round(formato.anchoMm * 8))
    assert.equal(leída.altoPuntos, Math.round(formato.altoMm * 8))
    assert.equal(leída.etiquetas.length, PRENDAS.length)
    assert.deepEqual(
      leída.etiquetas.map((e) => e.copias),
      PRENDAS.map((p) => p.copias),
    )

    for (const [n, etiqueta] of leída.etiquetas.entries()) {
      const els = etiqueta.elementos
      // Los cinco: monograma, nombre, precio, código y SKU.
      assert.ok(els.some((e) => e.tipo === 'imagen'), `${formato.id} #${n}: falta el monograma`)
      assert.ok(els.some((e) => e.tipo === 'codigo'), `${formato.id} #${n}: falta el código de barras`)
      const textos = els.filter((e) => e.tipo === 'texto').map((e) => (e as { contenido: string }).contenido)
      assert.ok(textos.includes(precioEtiqueta(PRENDAS[n]!.precioCents)), `${formato.id} #${n}: falta el precio`)
      assert.ok(textos.includes(PRENDAS[n]!.sku), `${formato.id} #${n}: falta el SKU`)

      for (const e of els) {
        assert.ok(e.x >= 0 && e.y >= 0, `${formato.id} #${n}: ${e.tipo} empieza fuera (${e.x},${e.y})`)
        assert.ok(e.x + e.ancho <= leída.anchoPuntos, `${formato.id} #${n}: ${e.tipo} se sale por la derecha`)
        assert.ok(e.y + e.alto <= leída.altoPuntos, `${formato.id} #${n}: ${e.tipo} se sale por abajo`)
      }
      for (let i = 0; i < els.length; i++) {
        for (let j = i + 1; j < els.length; j++) {
          assert.ok(
            !solapan(els[i]!, els[j]!),
            `${formato.id} #${n}: se enciman ${els[i]!.tipo} y ${els[j]!.tipo} (${JSON.stringify([els[i], els[j]].map((e) => ('contenido' in e ? e.contenido : e.tipo)))})`,
          )
        }
      }
    }
  })
}

test('una talla de una sola letra también sale', () => {
  for (const formato of FORMATOS_ETIQUETA) {
    const { bytes } = buildEtiquetas(
      [{ nombre: 'Blusa Satinada Drapeada Negra', detalle: 'M', precioCents: 129000, sku: 'LM-BLUSAT-M', codigoBarras: null, copias: 1 }],
      formato,
    )
    const textos = leerEtiqueta(bytes).etiquetas[0]!.elementos.flatMap((e) => (e.tipo === 'texto' ? [e.contenido] : []))
    assert.ok(textos.includes('M'), `${formato.id}: falta la talla M`)
  }
})

test('los acentos van en la página 850, igual que el ticket', () => {
  const { bytes } = buildEtiquetas(
    [{ nombre: 'Suéter Ñandú', detalle: 'Única', precioCents: 100, sku: 'X', codigoBarras: null, copias: 1 }],
    FORMATOS_ETIQUETA[5]!,
  )
  const texto = leerEtiqueta(bytes).etiquetas[0]!.elementos.filter((e) => e.tipo === 'texto')
  assert.ok(texto.some((e) => 'contenido' in e && e.contenido.includes('Suéter Ñandú')))
  assert.ok(String.fromCharCode(...bytes).includes('CODEPAGE 850'))
})

test('las comillas del nombre se escapan', () => {
  const { bytes } = buildEtiquetas(
    [{ nombre: 'Blusa "Luna"', detalle: null, precioCents: 100, sku: 'X1', codigoBarras: null, copias: 1 }],
    FORMATOS_ETIQUETA[5]!,
  )
  assert.ok(String.fromCharCode(...bytes).includes('Blusa \\["]Luna\\["]'))
  const nombre = leerEtiqueta(bytes).etiquetas[0]!.elementos.find((e) => e.tipo === 'texto')
  assert.equal(nombre && 'contenido' in nombre ? nombre.contenido : '', 'Blusa "Luna"')
})

test('un EAN-13 de proveedor se imprime como EAN-13; el SKU, como Code 128', () => {
  assert.equal(tipoDeCodigo('7501234567893'), 'EAN13')
  assert.equal(tipoDeCodigo('7501234567890'), '128') // dígito verificador malo
  assert.equal(tipoDeCodigo('1001-M-NEG'), '128')
  assert.equal(tipoDeCodigo('036000291452'), 'UPCA')
})

test('el ancho de Code 128 usa el juego C en rachas de dígitos', () => {
  assert.equal(modulosDeCodigo('ABC', '128'), 35 + 33)
  assert.equal(modulosDeCodigo('1001', '128'), 35 + 22)
  assert.equal(modulosDeCodigo('10011', '128'), 35 + 22 + 22)
  assert.equal(modulosDeCodigo('1001-M', '128'), 35 + 22 + 11 + 22)
})

test('precio sin MXN y con centavos solo si los hay', () => {
  assert.equal(precioEtiqueta(189000), '$1,890')
  assert.equal(precioEtiqueta(1249950), '$12,499.50')
  assert.equal(precioEtiqueta(9900), '$99')
})

test('la etiqueta de prueba lleva el recuadro del borde', () => {
  const leída = leerEtiqueta(buildEtiquetaPrueba(FORMATOS_ETIQUETA[5]!))
  assert.equal(leída.etiquetas.length, 1)
  assert.ok(leída.etiquetas[0]!.elementos.some((e) => e.tipo === 'caja'))
})

test('girar y desplazar cambian la cabecera, no el dibujo', () => {
  const normal = String.fromCharCode(...buildEtiquetaPrueba(FORMATOS_ETIQUETA[5]!))
  const girada = String.fromCharCode(...buildEtiquetaPrueba(FORMATOS_ETIQUETA[5]!, { girar: true, desplazarXmm: 1, desplazarYmm: -1 }))
  assert.match(normal, /DIRECTION 1,0/)
  assert.match(girada, /DIRECTION 0,0/)
  assert.match(girada, /REFERENCE 8,0/)
  assert.match(girada, /SHIFT -8/)
})
