import { useCallback, useEffect, useMemo, useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { FORMATOS_ETIQUETA, MEDIDA_MAXIMA_MM, MEDIDA_MINIMA_MM } from '@lumane/core'
import { errorMessage } from '@lumane/db'

import type { DispositivoBt } from '../../../modules/impresora-bt'
import {
  buscarCercanas,
  cargarImpresora,
  dispositivosEmparejados,
  elegir,
  emparejar,
  guardarEtiquetadora,
  guardarPreferencias,
  puedeBuscar,
  transporteDe,
  useImpresora,
  type Rol,
} from '@/features/printer/impresora'
import { ajustesDe, formatoDe, imprimirEtiquetaPrueba, nombreFormato } from '@/features/printer/etiquetas'
import { imprimirPrueba, olvidarCabecera } from '@/features/printer/tickets'
import { VistaEtiqueta } from '@/features/printer/VistaEtiqueta'
import { Button } from '@/ui/Button'
import { Chip } from '@/ui/Chip'
import { Field } from '@/ui/Field'
import { color, s, size, space, useVertical } from '@/theme'

/**
 * Las impresoras de caja: la de tickets y la etiquetadora.
 *
 * Se configuran una vez por tablet: emparejar, elegir, imprimir la prueba. La
 * lista de aparatos es la misma para las dos; lo que se toque en ella se
 * asigna a la pestaña abierta.
 */
export default function Impresora() {
  const params = useLocalSearchParams<{ rol?: string }>()
  const [rol, setRol] = useState<Rol>(params.rol === 'etiquetas' ? 'etiquetas' : 'tickets')
  const vertical = useVertical()
  const { prefs, estado, error } = useImpresora()
  const [dispositivos, setDispositivos] = useState<DispositivoBt[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // Buscar y emparejar desde aquí: para cuando el PIN falla en los ajustes de
  // Android, o para las impresoras que solo hablan Bluetooth LE.
  const [cercanas, setCercanas] = useState<DispositivoBt[] | null>(null)
  const [explorando, setExplorando] = useState(false)
  const [emparejando, setEmparejando] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [falloCerca, setFalloCerca] = useState<string | null>(null)

  useEffect(() => {
    if (params.rol === 'etiquetas' || params.rol === 'tickets') setRol(params.rol)
  }, [params.rol])

  const elegida = rol === 'tickets' ? prefs.mac : prefs.etiquetadora.mac

  async function explorar() {
    setExplorando(true)
    setFalloCerca(null)
    try {
      setCercanas(await buscarCercanas())
    } catch (e) {
      setFalloCerca(errorMessage(e as { message?: string }))
    } finally {
      setExplorando(false)
    }
  }

  async function emparejarCon(d: DispositivoBt) {
    setEmparejando(d.mac)
    setFalloCerca(null)
    setAviso(null)
    try {
      const listo = await emparejar(d.mac, pin)
      await elegir(rol, listo)
      setCercanas((l) => l?.filter((x) => x.mac !== d.mac) ?? null)
      setAviso(
        `${rol === 'tickets' ? 'Impresora de tickets' : 'Etiquetadora'} lista. Imprime la prueba para comprobarla.`,
      )
      void buscar()
    } catch (e) {
      setFalloCerca(errorMessage(e as { message?: string }))
    } finally {
      setEmparejando(null)
    }
  }

  const buscar = useCallback(async () => {
    setBuscando(true)
    setFallo(null)
    try {
      setDispositivos(await dispositivosEmparejados())
    } catch (e) {
      setFallo(errorMessage(e as { message?: string }))
    } finally {
      setBuscando(false)
    }
  }, [])

  useEffect(() => {
    void cargarImpresora().then(() => {
      if (estado !== 'sin-modulo') void buscar()
    })
    // Solo al entrar: volver a listar en cada cambio de estado haría parpadear la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function prueba() {
    setAviso(null)
    setFallo(null)
    try {
      if (rol === 'tickets') {
        // La prueba es también la forma de ver un cambio hecho en Admin › Ajustes.
        olvidarCabecera()
        await imprimirPrueba()
        setAviso('Página de prueba impresa.')
      } else {
        await imprimirEtiquetaPrueba()
        setAviso(
          'Etiqueta de prueba mandada. El recuadro debe quedar completo y centrado; si no, ajusta la medida o el desplazamiento.',
        )
      }
    } catch (e) {
      setFallo(errorMessage(e as { message?: string }))
    }
  }

  if (estado === 'sin-modulo') {
    return (
      <View style={[s.screen, k.centro]}>
        <View style={k.tarjeta}>
          <Text style={s.label}>Impresora</Text>
          <Text style={[s.headlineMd, k.titulo]}>Hace falta actualizar la app</Text>
          <Text style={s.bodyMuted}>
            Esta versión del POS no incluye el módulo de impresora. Instala la versión más reciente en la
            tablet de caja.
          </Text>
        </View>
      </View>
    )
  }

  const nombre = rol === 'tickets' ? prefs.nombre : prefs.etiquetadora.nombre
  const transporte = transporteDe(elegida)

  return (
    <ScrollView contentContainerStyle={k.raiz}>
      <View style={k.pestañas}>
        <Chip label="Tickets" active={rol === 'tickets'} onPress={() => setRol('tickets')} />
        <Chip label="Etiquetas" active={rol === 'etiquetas'} onPress={() => setRol('etiquetas')} />
      </View>

      <View style={[k.cuerpo, vertical && k.cuerpoVertical]}>
        <View style={[k.columna, vertical && k.columnaVertical]}>
          <View style={k.tarjeta}>
            <Text style={s.label}>
              {rol === 'tickets' ? 'Impresora de tickets' : 'Etiquetadora de prendas'}
            </Text>
            <Text style={[s.headlineMd, k.titulo]}>{nombre ?? 'Sin elegir'}</Text>
            <Text style={s.bodyMuted}>
              {estado === 'imprimiendo'
                ? 'Imprimiendo…'
                : estado === 'error'
                  ? `Último intento: ${error ?? 'falló'}`
                  : elegida
                    ? `Elegida. Se conecta sola al imprimir${transporte === 'ble' ? ' (Bluetooth LE)' : transporte === 'clasico' ? ' (Bluetooth clásico)' : ''}.`
                    : rol === 'tickets'
                      ? 'Elige la impresora de tickets en la lista.'
                      : 'Elige la etiquetadora (la Hanna58) en la lista.'}
            </Text>

            {fallo ? <Text style={[s.body, k.fallo]}>{fallo}</Text> : null}
            {aviso ? <Text style={[s.bodyMuted, k.aviso]}>{aviso}</Text> : null}

            <View style={k.espacio} />
            <Button
              label={rol === 'tickets' ? 'Imprimir página de prueba' : 'Imprimir etiqueta de prueba'}
              size="lg"
              fullWidth
              loading={estado === 'imprimiendo'}
              disabled={!elegida || estado === 'imprimiendo'}
              onPress={() => void prueba()}
            />
          </View>

          {rol === 'tickets' ? (
            <View style={k.tarjeta}>
              <Text style={s.label}>Cuándo imprime</Text>
              <Interruptor
                etiqueta="Ticket al cobrar"
                detalle="Sale solo en cuanto se registra la venta."
                valor={prefs.autoImprimir}
                onCambio={(v) => void guardarPreferencias({ autoImprimir: v })}
              />
              <Interruptor
                etiqueta="Corte al cerrar la caja"
                detalle="Para firmarlo y guardarlo con el efectivo."
                valor={prefs.imprimirCorte}
                onCambio={(v) => void guardarPreferencias({ imprimirCorte: v })}
              />
              <Interruptor
                etiqueta="Dos copias del ticket"
                detalle="Una para la clienta y otra para la tienda."
                valor={prefs.copias === 2}
                onCambio={(v) => void guardarPreferencias({ copias: v ? 2 : 1 })}
              />
            </View>
          ) : (
            <AjustesEtiquetas />
          )}
        </View>

        <View style={[k.columna, vertical && k.columnaVertical]}>
          <View style={k.tarjeta}>
            <Text style={s.label}>Emparejadas con esta tablet</Text>
            <Text style={[s.bodyMuted, k.nota]}>
              Toca una para usarla como {rol === 'tickets' ? 'impresora de tickets' : 'etiquetadora'}. ¿No
              aparece? Enciéndela y emparéjala en los ajustes de Bluetooth (PIN 0000 o 1234), o búscala abajo
              en «Emparejar desde aquí».
            </Text>

            {dispositivos?.length === 0 ? (
              <Text style={s.bodyMuted}>No hay ningún aparato emparejado.</Text>
            ) : null}

            {dispositivos?.map((d) => {
              const esEsta = d.mac === elegida
              const otraFuncion =
                rol === 'tickets'
                  ? d.mac === prefs.etiquetadora.mac && 'Etiquetas'
                  : d.mac === prefs.mac && 'Tickets'
              return (
                <Pressable
                  key={d.mac}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: esEsta }}
                  onPress={() => void elegir(rol, d)}
                  style={({ pressed }) => [k.fila, esEsta && k.filaElegida, pressed && k.filaPulsada]}
                >
                  <View style={s.fill}>
                    <Text style={s.body}>{d.nombre}</Text>
                    <Text style={s.bodyMuted}>{d.mac}</Text>
                  </View>
                  <Text style={s.label}>
                    {esEsta
                      ? 'Elegida'
                      : otraFuncion
                        ? `Es la de ${otraFuncion}`
                        : d.esImpresora
                          ? 'Impresora'
                          : ''}
                  </Text>
                </Pressable>
              )
            })}

            <View style={k.espacio} />
            <View style={k.dos}>
              <View style={s.fill}>
                <Button
                  label="Buscar otra vez"
                  variant="outline"
                  fullWidth
                  loading={buscando}
                  onPress={() => void buscar()}
                />
              </View>
              <View style={s.fill}>
                <Button
                  label="Ajustes de Bluetooth"
                  variant="outline"
                  fullWidth
                  onPress={() => void Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS')}
                />
              </View>
            </View>
          </View>

          {puedeBuscar() ? (
            <View style={k.tarjeta}>
              <Text style={s.label}>Emparejar desde aquí</Text>
              <Text style={[s.bodyMuted, k.nota]}>
                Si en los ajustes de Android el PIN no funcionó, búscala aquí: la app pone el PIN sola (prueba
                0000, 1234 y otros de fábrica). Las impresoras que solo usan Bluetooth LE también aparecen
                aquí y no necesitan PIN. Si la tuya usa otro PIN, escríbelo; sale en su hoja de prueba, que se
                imprime manteniendo el botón de papel al encenderla.
              </Text>

              <Field
                label="PIN (opcional)"
                value={pin}
                onChangeText={setPin}
                keyboardType="number-pad"
                maxLength={16}
                editable={!emparejando}
              />

              {falloCerca ? <Text style={[s.body, k.fallo]}>{falloCerca}</Text> : null}

              {cercanas?.length === 0 ? (
                <Text style={[s.bodyMuted, k.fallo]}>
                  No apareció nada. Revisa que la impresora esté encendida, cerca, y que no esté conectada a
                  otro teléfono.
                </Text>
              ) : null}

              {cercanas?.map((d) => (
                <Pressable
                  key={d.mac}
                  accessibilityRole="button"
                  disabled={emparejando !== null}
                  onPress={() => void emparejarCon(d)}
                  style={({ pressed }) => [k.fila, pressed && k.filaPulsada]}
                >
                  <View style={s.fill}>
                    <Text style={s.body}>{d.nombre}</Text>
                    <Text style={s.bodyMuted}>
                      {d.mac}
                      {d.tipo === 'ble' ? ' · Bluetooth LE' : ''}
                    </Text>
                  </View>
                  <Text style={s.label}>
                    {emparejando === d.mac
                      ? 'Conectando…'
                      : d.tipo === 'ble'
                        ? 'Usar'
                        : d.esImpresora
                          ? 'Impresora · Emparejar'
                          : 'Emparejar'}
                  </Text>
                </Pressable>
              ))}

              <View style={k.espacio} />
              <Button
                label={explorando ? 'Buscando… (unos 15 s)' : 'Buscar impresoras cercanas'}
                variant="outline"
                fullWidth
                loading={explorando}
                disabled={explorando || emparejando !== null}
                onPress={() => void explorar()}
              />
            </View>
          ) : null}
        </View>
      </View>
    </ScrollView>
  )
}

/** Qué etiqueta lleva cargada la etiquetadora y la calibración fina. */
function AjustesEtiquetas() {
  const { prefs } = useImpresora()
  const e = prefs.etiquetadora
  const personalizada = e.formatoId === 'personalizada'
  const [ancho, setAncho] = useState(String(e.anchoMm))
  const [alto, setAlto] = useState(String(e.altoMm))
  const [hueco, setHueco] = useState(String(e.separacionMm))
  const [falloMedida, setFalloMedida] = useState<string | null>(null)
  const [anchoVista, setAnchoVista] = useState(280)

  useEffect(() => {
    setAncho(String(e.anchoMm))
    setAlto(String(e.altoMm))
    setHueco(String(e.separacionMm))
  }, [e.anchoMm, e.altoMm, e.separacionMm])

  function guardarMedida() {
    const a = Number(ancho.replace(',', '.'))
    const h = Number(alto.replace(',', '.'))
    const g = Number(hueco.replace(',', '.'))
    if (!(a >= MEDIDA_MINIMA_MM.ancho && a <= MEDIDA_MAXIMA_MM.ancho)) {
      setFalloMedida(`El ancho va de ${MEDIDA_MINIMA_MM.ancho} a ${MEDIDA_MAXIMA_MM.ancho} mm`)
      return
    }
    if (!(h >= MEDIDA_MINIMA_MM.alto && h <= MEDIDA_MAXIMA_MM.alto)) {
      setFalloMedida(`El alto va de ${MEDIDA_MINIMA_MM.alto} a ${MEDIDA_MAXIMA_MM.alto} mm`)
      return
    }
    if (!(g >= 0 && g <= 10)) {
      setFalloMedida('La separación va de 0 (papel continuo) a 10 mm')
      return
    }
    setFalloMedida(null)
    void guardarEtiquetadora({
      formatoId: 'personalizada',
      anchoMm: a,
      altoMm: h,
      separacionMm: g,
    })
  }

  const formato = useMemo(() => formatoDe(e), [e])
  const ajustes = useMemo(() => ajustesDe(e), [e])

  return (
    <>
      <View style={k.tarjeta}>
        <Text style={s.label}>Etiqueta cargada</Text>
        <Text style={[s.bodyMuted, k.nota]}>
          Elige la medida del rollo que tiene puesto la etiquetadora (ancho × alto de UNA etiqueta). Viene
          impresa en la caja del rollo.
        </Text>
        <View style={k.formatos}>
          {FORMATOS_ETIQUETA.map((f) => (
            <Chip
              key={f.id}
              label={f.nombre.replace(' mm', '')}
              active={e.formatoId === f.id}
              onPress={() =>
                void guardarEtiquetadora({
                  formatoId: f.id,
                  anchoMm: f.anchoMm,
                  altoMm: f.altoMm,
                  separacionMm: f.separacionMm,
                })
              }
            />
          ))}
          <Chip
            label="Otra medida"
            active={personalizada}
            onPress={() => void guardarEtiquetadora({ formatoId: 'personalizada' })}
          />
        </View>

        {personalizada ? (
          <View style={k.medidas}>
            <View style={s.fill}>
              <Field label="Ancho (mm)" value={ancho} onChangeText={setAncho} keyboardType="decimal-pad" />
            </View>
            <View style={s.fill}>
              <Field label="Alto (mm)" value={alto} onChangeText={setAlto} keyboardType="decimal-pad" />
            </View>
            <View style={s.fill}>
              <Field
                label="Separación (mm)"
                value={hueco}
                onChangeText={setHueco}
                keyboardType="decimal-pad"
              />
            </View>
            <Button label="Guardar" variant="outline" onPress={guardarMedida} />
          </View>
        ) : null}
        {falloMedida ? <Text style={[s.body, k.fallo]}>{falloMedida}</Text> : null}

        <View style={k.vista} onLayout={(ev) => setAnchoVista(Math.min(360, ev.nativeEvent.layout.width))}>
          <Text style={[s.label, k.nota]}>Así sale · {nombreFormato(e)}</Text>
          <VistaEtiqueta
            datos={{
              nombre: 'Vestido Midi Satinado',
              detalle: 'Mediana / Negro',
              precioCents: 189000,
              sku: '1001-M-NEG',
              codigoBarras: null,
              copias: 1,
            }}
            formato={formato}
            ajustes={ajustes}
            ancho={anchoVista}
          />
        </View>
      </View>

      <View style={k.tarjeta}>
        <Text style={s.label}>Ajuste fino</Text>
        <Paso
          etiqueta="Oscuridad"
          detalle="Súbela si el código de barras sale gris o no se lee."
          valor={String(e.densidad)}
          onMenos={() => void guardarEtiquetadora({ densidad: Math.max(0, e.densidad - 1) })}
          onMas={() => void guardarEtiquetadora({ densidad: Math.min(15, e.densidad + 1) })}
        />
        <Paso
          etiqueta="Velocidad"
          detalle="Más lenta imprime más nítido."
          valor={String(e.velocidad)}
          onMenos={() =>
            void guardarEtiquetadora({
              velocidad: Math.max(1, e.velocidad - 1),
            })
          }
          onMas={() =>
            void guardarEtiquetadora({
              velocidad: Math.min(6, e.velocidad + 1),
            })
          }
        />
        <Paso
          etiqueta="Mover a la derecha"
          detalle="Si el recuadro de la prueba sale corrido de lado."
          valor={`${e.desplazarXmm} mm`}
          onMenos={() =>
            void guardarEtiquetadora({
              desplazarXmm: Math.max(0, redondear(e.desplazarXmm - 0.5)),
            })
          }
          onMas={() =>
            void guardarEtiquetadora({
              desplazarXmm: Math.min(10, redondear(e.desplazarXmm + 0.5)),
            })
          }
        />
        <Paso
          etiqueta="Mover abajo"
          detalle="Negativo sube la impresión; positivo la baja."
          valor={`${e.desplazarYmm} mm`}
          onMenos={() =>
            void guardarEtiquetadora({
              desplazarYmm: Math.max(-10, redondear(e.desplazarYmm - 0.5)),
            })
          }
          onMas={() =>
            void guardarEtiquetadora({
              desplazarYmm: Math.min(10, redondear(e.desplazarYmm + 0.5)),
            })
          }
        />
        <Interruptor
          etiqueta="Girar 180°"
          detalle="Si la etiqueta sale de cabeza respecto a como cuelga en la prenda."
          valor={e.girar}
          onCambio={(v) => void guardarEtiquetadora({ girar: v })}
        />
      </View>
    </>
  )
}

function redondear(n: number): number {
  return Math.round(n * 10) / 10
}

function Paso({
  etiqueta,
  detalle,
  valor,
  onMenos,
  onMas,
}: {
  etiqueta: string
  detalle: string
  valor: string
  onMenos: () => void
  onMas: () => void
}) {
  return (
    <View style={k.interruptor}>
      <View style={s.fill}>
        <Text style={s.body}>{etiqueta}</Text>
        <Text style={s.bodyMuted}>{detalle}</Text>
      </View>
      <View style={k.pasos}>
        <Pressable onPress={onMenos} style={k.paso} accessibilityLabel={`${etiqueta}: menos`}>
          <Text style={s.bodyLg}>−</Text>
        </Pressable>
        <Text style={[s.body, k.valor]}>{valor}</Text>
        <Pressable onPress={onMas} style={k.paso} accessibilityLabel={`${etiqueta}: más`}>
          <Text style={s.bodyLg}>+</Text>
        </Pressable>
      </View>
    </View>
  )
}

function Interruptor({
  etiqueta,
  detalle,
  valor,
  onCambio,
}: {
  etiqueta: string
  detalle: string
  valor: boolean
  onCambio: (v: boolean) => void
}) {
  return (
    <View style={k.interruptor}>
      <View style={s.fill}>
        <Text style={s.body}>{etiqueta}</Text>
        <Text style={s.bodyMuted}>{detalle}</Text>
      </View>
      <Switch
        value={valor}
        onValueChange={onCambio}
        trackColor={{ true: color.primary, false: color['surface-variant'] }}
        accessibilityLabel={etiqueta}
      />
    </View>
  )
}

const k = StyleSheet.create({
  centro: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.edge,
  },
  raiz: { padding: space.edge, gap: space.gutter },
  pestañas: { flexDirection: 'row', gap: space.gap },
  cuerpo: { flexDirection: 'row', gap: space.gutter },
  cuerpoVertical: { flexDirection: 'column' },
  columna: { flex: 1, gap: space.gutter },
  // En columna, `flex: 1` dentro de un ScrollView mide cero: cada bloque toma su alto.
  columnaVertical: { flex: 0, flexBasis: 'auto', alignSelf: 'stretch' },
  tarjeta: {
    width: '100%',
    maxWidth: 640,
    backgroundColor: color['paper-bright'],
    borderWidth: 1,
    borderColor: color.primary,
    padding: space.edge,
  },
  titulo: { marginTop: 4, marginBottom: space.gap },
  nota: { fontSize: 13, marginBottom: space.gap },
  espacio: { height: space.gutter },
  dos: { flexDirection: 'row', gap: space.gap },
  fallo: { marginTop: space.gap },
  aviso: { marginTop: space.gap },
  fila: {
    minHeight: size.touchMin,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gap,
    paddingHorizontal: space.gap,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: color['surface-variant'],
    marginTop: space.gap,
  },
  filaElegida: { borderWidth: size.border, borderColor: color.primary },
  filaPulsada: { backgroundColor: color['surface-variant'] },
  interruptor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.gap,
    paddingVertical: 10,
  },
  formatos: { flexDirection: 'row', flexWrap: 'wrap', gap: space.gap },
  medidas: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.gap,
    marginTop: space.gap,
  },
  vista: { marginTop: space.gutter },
  pasos: { flexDirection: 'row', alignItems: 'center' },
  paso: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color['surface-variant'],
  },
  valor: { minWidth: 64, textAlign: 'center' },
})
