/**
 * Las etiquetas de prenda, comprobadas sin etiquetadora.
 *
 * En una etiqueta lo que se rompe es la geometría: algo que se sale del borde
 * no se imprime, y dos imágenes encimadas se borran una a otra (`BITMAP`
 * sobrescribe). Así que se lee el TSPL de vuelta a cajas y se comprueba eso,
 * en TODOS los tamaños del catálogo y con los nombres más incómodos; y en la
 * composición, que cada texto esté y del tamaño que toca.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inflateSync } from 'node:zlib'

import {
  anchoTexto,
  buildEtiquetaPrueba,
  buildEtiquetas,
  componerEtiqueta,
  FORMATOS_ETIQUETA,
  leerEtiqueta,
  letra,
  modulosDeCodigo,
  pngDeRaster,
  precioEtiqueta,
  rasterizarEtiqueta,
  tamañosDe,
  textoEnBits,
  tipoDeCodigo,
  type DatosEtiqueta,
  type ElementoEtiqueta,
  type PiezaEtiqueta,
} from '../src/index.ts'

const PRENDAS: DatosEtiqueta[] = [
  { nombre: 'Vestido Midi Satinado', detalle: 'Mediana / Negro', precioCents: 189000, sku: '1001-M-NEG', copias: 2 },
  {
    nombre: 'Conjunto estructurado de lino con botones dorados y cinturón',
    detalle: 'Extra grande / Azul marino',
    precioCents: 1249950,
    sku: '10234-XG-AM',
    copias: 1,
  },
  { nombre: 'Bolso', detalle: null, precioCents: 320000, sku: '1003', copias: 1 },
]

function solapan(a: ElementoEtiqueta, b: ElementoEtiqueta): boolean {
  return a.x < b.x + b.ancho && b.x < a.x + a.ancho && a.y < b.y + b.alto && b.y < a.y + a.alto
}

function textos(piezas: PiezaEtiqueta[]): Record<string, string> {
  return Object.fromEntries(piezas.flatMap((p) => (p.tipo === 'texto' ? [[p.papel, p.contenido]] : [])))
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
      // Sin código de barras ni fuentes residentes: todo es imagen o línea.
      assert.ok(els.every((e) => e.tipo === 'imagen' || e.tipo === 'barra'), `${formato.id} #${n}: hay TEXT o BARCODE`)

      for (const e of els) {
        assert.ok(e.x >= 0 && e.y >= 0, `${formato.id} #${n}: ${e.tipo} empieza fuera (${e.x},${e.y})`)
        assert.ok(e.x + e.ancho <= leída.anchoPuntos, `${formato.id} #${n}: ${e.tipo} se sale por la derecha`)
        assert.ok(e.y + e.alto <= leída.altoPuntos, `${formato.id} #${n}: ${e.tipo} se sale por abajo`)
      }
      for (let i = 0; i < els.length; i++) {
        for (let j = i + 1; j < els.length; j++) {
          assert.ok(!solapan(els[i]!, els[j]!), `${formato.id} #${n}: se enciman ${JSON.stringify([els[i], els[j]].map((e) => [e.tipo, e.x, e.y, e.ancho, e.alto]))}`)
        }
      }

      // Y en la composición: monograma, nombre, precio y código de pieza.
      const { piezas } = componerEtiqueta(PRENDAS[n]!, leída.anchoPuntos, leída.altoPuntos)
      const t = textos(piezas)
      // En 30 × 20 el monograma cede su sitio a un nombre largo.
      if (formato.altoMm >= 25 || n !== 1) assert.ok(piezas.some((p) => p.tipo === 'logo'), `${formato.id} #${n}: falta el monograma`)
      assert.equal(t.precio, precioEtiqueta(PRENDAS[n]!.precioCents), `${formato.id} #${n}: falta el precio`)
      assert.equal(t.sku, PRENDAS[n]!.sku, `${formato.id} #${n}: falta el código de pieza`)
      assert.ok(t.nombre, `${formato.id} #${n}: falta el nombre`)
      if (PRENDAS[n]!.detalle) assert.ok(t.detalle, `${formato.id} #${n}: falta la talla`)
    }
  })
}

test('50 × 25: el nombre, el código de pieza y el precio salen grandes', () => {
  const { piezas, avisos } = componerEtiqueta(PRENDAS[0]!, 400, 200)
  const tamaño = (papel: string) => piezas.find((p) => p.tipo === 'texto' && p.papel === papel)!
  assert.deepEqual(avisos, [])
  // En puntos por eme; la mayúscula es 0.7: 3.3 mm de nombre, 2.1 mm de
  // código y 5.6 mm de precio. La impresa con fuentes residentes daba 2 mm a todo.
  assert.ok((tamaño('nombre') as { letra: number }).letra >= 28)
  assert.ok((tamaño('sku') as { letra: number }).letra >= 24)
  assert.ok((tamaño('precio') as { letra: number }).letra >= 56)
  assert.equal(textos(piezas).nombre, 'Vestido Midi Satinado')
  assert.equal(textos(piezas).detalle, 'Mediana / Negro')
})

test('una talla de una sola letra también sale', () => {
  for (const formato of FORMATOS_ETIQUETA) {
    const d = { nombre: 'Blusa Satinada Drapeada Negra', detalle: 'M', precioCents: 129000, sku: 'LM-BLUSAT-M', copias: 1 }
    const t = textos(componerEtiqueta(d, Math.round(formato.anchoMm * 8), Math.round(formato.altoMm * 8)).piezas)
    assert.equal(t.detalle, 'M', `${formato.id}: falta la talla M`)
  }
})

test('un nombre que no cabe se recorta con … y avisa', () => {
  const d = { nombre: 'Palabra '.repeat(40).trim(), detalle: null, precioCents: 100, sku: 'X1', copias: 1 }
  const { piezas, avisos } = componerEtiqueta(d, 400, 200)
  assert.ok(textos(piezas).nombre!.endsWith('…'))
  assert.ok(avisos.some((a) => a.includes('no cabe completo')))
})

test('los acentos y la ñ tienen su propia letra en todos los tamaños', () => {
  for (const t of tamañosDe('bold')) {
    const l = letra('bold', t)
    for (const c of 'áéíóúÁÉÍÓÚñÑüÜ¿¡') {
      assert.ok(l.glifos.has(c.codePointAt(0)!), `falta «${c}» a ${t}`)
    }
    // Una «é» no es una «e»: lleva el acento encima.
    const e = textoEnBits(['e'], l)
    const é = textoEnBits(['é'], l)
    assert.ok(é.imagen.height > e.imagen.height)
  }
})

test('un carácter sin letra cae al mismo sin acento y, si no, a «?»', () => {
  const l = letra('bold', 24)
  assert.equal(anchoTexto('ā', l), anchoTexto('a', l))
  assert.equal(anchoTexto('漢', l), anchoTexto('?', l))
})

test('el texto en bits respeta el ancho y la línea base', () => {
  const l = letra('bold', 30)
  const r = textoEnBits(['Vestido', 'Midi'], l, { interlineado: 34 })
  assert.equal(r.imagen.width % 8, 0)
  assert.ok(r.ancho <= r.imagen.width && r.imagen.width - r.ancho < 8)
  assert.equal(r.ancho, anchoTexto('Vestido', l))
  // La «V» llega a la altura de la mayúscula sobre la línea base.
  assert.ok(Math.abs(r.base - l.mayuscula) <= 2)
  assert.equal(r.imagen.data.length, (r.imagen.width / 8) * r.imagen.height)
})

test('la vista previa es un PNG con los mismos puntos que el TSPL', () => {
  const leída = leerEtiqueta(buildEtiquetas([PRENDAS[0]!], FORMATOS_ETIQUETA[3]!).bytes)
  const r = rasterizarEtiqueta(leída.anchoPuntos, leída.altoPuntos, leída.etiquetas[0]!.elementos)
  assert.equal(r.width, 400)
  assert.equal(r.height, 200)
  assert.ok(r.data.some((b) => b !== 0), 'la vista salió en blanco')

  const png = pngDeRaster(r)
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const vista = new DataView(png.buffer, png.byteOffset)
  assert.equal(vista.getUint32(16), 400)
  assert.equal(vista.getUint32(20), 200)
  // IDAT empieza tras la firma (8) e IHDR (25): longitud, tipo y datos.
  const largo = vista.getUint32(33)
  const crudo = inflateSync(png.subarray(41, 41 + largo))
  assert.equal(crudo.length, 200 * 51)
  // Fila 0 en blanco salvo lo que haya; 1 bit = blanco en el PNG.
  for (let y = 0; y < 200; y++) {
    assert.equal(crudo[y * 51], 0)
    for (let x = 0; x < 50; x++) assert.equal(crudo[y * 51 + 1 + x], ~r.data[y * 50 + x]! & 0xff)
  }
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

// El constructor TSPL sigue sabiendo hacer códigos de barras, aunque la
// etiqueta de prendas ya no los lleve.
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
