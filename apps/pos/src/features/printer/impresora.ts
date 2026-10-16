import { useSyncExternalStore } from 'react'
import { PermissionsAndroid, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
// Base64 a mano: los bytes cruzan el puente como texto, y así no se depende de `btoa`.
import { aBase64 } from '@lumane/core'

import { ImpresoraBt, type DispositivoBt } from '../../../modules/impresora-bt'

/**
 * Las impresoras de caja: la de tickets (ESC/POS, la Moon58W) y la
 * etiquetadora de prendas (TSPL, la Hanna58). Son aparatos distintos que
 * hablan lenguajes distintos, así que cada una tiene su MAC y sus ajustes.
 *
 * Aquí viven tres cosas que el resto del POS no tiene por qué conocer:
 *
 *  - **Qué impresoras**: las MAC elegidas en el módulo Impresora, guardadas en
 *    el aparato. Es configuración de ESTA tablet, no de la tienda; por eso no
 *    va a la base.
 *  - **La cola**: cada impresión espera a que termine la anterior. Un ticket
 *    automático y una reimpresión pulsada a la vez saldrían entrelazados.
 *  - **El estado**, para pintarlo sin preguntar al módulo nativo a cada rato.
 *
 * Nunca lanza hacia la venta: quien imprime decide qué hacer con el error. Una
 * venta cobrada no se deshace porque se acabó el papel.
 */

/** La etiquetadora y la etiqueta que lleva cargada. */
export interface PreferenciasEtiquetadora {
  mac: string | null
  nombre: string | null
  /** Id de `FORMATOS_ETIQUETA`, o `'personalizada'`. */
  formatoId: string
  anchoMm: number
  altoMm: number
  separacionMm: number
  /** 0–15. */
  densidad: number
  velocidad: number
  girar: boolean
  desplazarXmm: number
  desplazarYmm: number
}

export interface PreferenciasImpresora {
  /** La de tickets. */
  mac: string | null
  nombre: string | null
  /** Imprimir el ticket en cuanto se cobra. */
  autoImprimir: boolean
  /** Imprimir el corte al cerrar la caja. */
  imprimirCorte: boolean
  /** Copias del ticket de venta (la del cliente y, si se quiere, la de la tienda). */
  copias: 1 | 2
  etiquetadora: PreferenciasEtiquetadora
}

/** Qué impresora: la de tickets o la de etiquetas. */
export type Rol = 'tickets' | 'etiquetas'

export type EstadoImpresora = 'sin-modulo' | 'sin-configurar' | 'lista' | 'imprimiendo' | 'error'

interface Estado {
  prefs: PreferenciasImpresora
  estado: EstadoImpresora
  error: string | null
}

const CLAVE = 'lumane.impresora.v1'

/** 50 × 30 mm: la etiqueta colgante de ropa más común. */
export const ETIQUETADORA_INICIAL: PreferenciasEtiquetadora = {
  mac: null,
  nombre: null,
  formatoId: '50x30',
  anchoMm: 50,
  altoMm: 30,
  separacionMm: 2,
  densidad: 8,
  velocidad: 3,
  girar: false,
  desplazarXmm: 0,
  desplazarYmm: 0,
}

const PREFS_INICIALES: PreferenciasImpresora = {
  mac: null,
  nombre: null,
  autoImprimir: true,
  imprimirCorte: true,
  copias: 1,
  etiquetadora: ETIQUETADORA_INICIAL,
}

let actual: Estado = {
  prefs: PREFS_INICIALES,
  estado: ImpresoraBt ? 'sin-configurar' : 'sin-modulo',
  error: null,
}
const oyentes = new Set<() => void>()

function fijar(cambio: Partial<Estado>) {
  actual = { ...actual, ...cambio }
  for (const o of oyentes) o()
}

function estadoEnReposo(prefs: PreferenciasImpresora): EstadoImpresora {
  if (!ImpresoraBt) return 'sin-modulo'
  return prefs.mac ? 'lista' : 'sin-configurar'
}

let cargada: Promise<void> | null = null

/** Lee las preferencias guardadas. Idempotente: se puede llamar en cada pantalla. */
export function cargarImpresora(): Promise<void> {
  cargada ??= (async () => {
    try {
      const guardado = await AsyncStorage.getItem(CLAVE)
      if (guardado) {
        const leidas = JSON.parse(guardado) as Partial<PreferenciasImpresora>
        // Las guardadas antes de la etiquetadora no traen `etiquetadora`.
        const prefs = {
          ...PREFS_INICIALES,
          ...leidas,
          etiquetadora: { ...ETIQUETADORA_INICIAL, ...leidas.etiquetadora },
        }
        fijar({ prefs, estado: estadoEnReposo(prefs) })
      }
    } catch {
      // Unas preferencias ilegibles equivalen a no tener impresora elegida.
    }
  })()
  return cargada
}

export async function guardarPreferencias(cambio: Partial<PreferenciasImpresora>): Promise<void> {
  const prefs = { ...actual.prefs, ...cambio }
  fijar({ prefs, estado: estadoEnReposo(prefs), error: null })
  await AsyncStorage.setItem(CLAVE, JSON.stringify(prefs))
}

export async function guardarEtiquetadora(cambio: Partial<PreferenciasEtiquetadora>): Promise<void> {
  await guardarPreferencias({ etiquetadora: { ...actual.prefs.etiquetadora, ...cambio } })
}

/** Elige el aparato para un rol. */
export function elegir(rol: Rol, d: { mac: string; nombre: string }): Promise<void> {
  return rol === 'tickets'
    ? guardarPreferencias({ mac: d.mac, nombre: d.nombre })
    : guardarEtiquetadora({ mac: d.mac, nombre: d.nombre })
}

export function preferencias(): PreferenciasImpresora {
  return actual.prefs
}

/** Hay módulo nativo e impresora elegida. No garantiza que esté encendida. */
export function hayImpresora(): boolean {
  return Boolean(ImpresoraBt && actual.prefs.mac)
}

export function hayEtiquetadora(): boolean {
  return Boolean(ImpresoraBt && actual.prefs.etiquetadora.mac)
}

/** Por qué transporte imprimió la última vez: `clasico`, `ble` o null. */
export function transporteDe(mac: string | null): 'clasico' | 'ble' | null {
  if (!mac || typeof ImpresoraBt?.transporte !== 'function') return null
  return ImpresoraBt.transporte(mac)
}

export function useImpresora(): Estado {
  return useSyncExternalStore(
    (o) => {
      oyentes.add(o)
      return () => oyentes.delete(o)
    },
    () => actual,
  )
}

/**
 * El permiso de Bluetooth en tiempo de ejecución. Desde Android 12 hace falta
 * BLUETOOTH_CONNECT incluso para listar lo ya emparejado.
 */
export async function pedirPermisos(): Promise<boolean> {
  if (Platform.OS !== 'android' || Platform.Version < 31) return true
  const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT!, {
    title: 'Bluetooth',
    message: 'Lumane usa el Bluetooth para imprimir los tickets y las etiquetas de las prendas.',
    buttonPositive: 'Permitir',
  })
  return r === PermissionsAndroid.RESULTS.GRANTED
}

export async function dispositivosEmparejados(): Promise<DispositivoBt[]> {
  if (!ImpresoraBt) throw new Error('Esta versión de la app no tiene el módulo de impresora')
  if (!(await pedirPermisos())) throw new Error('Sin permiso de Bluetooth no se puede ver la impresora')
  if (!ImpresoraBt.bluetoothEncendido()) throw new Error('Enciende el Bluetooth de la tablet')
  const lista = await ImpresoraBt.emparejados()
  // Las que se anuncian como impresora, primero.
  return [...lista].sort((a, b) => Number(b.esImpresora) - Number(a.esImpresora))
}

/**
 * Los permisos para BUSCAR, que son más que los de imprimir: desde Android 12,
 * BLUETOOTH_SCAN; hasta el 11, el sistema lo trata como ubicación.
 */
async function pedirPermisosBusqueda(): Promise<boolean> {
  if (Platform.OS !== 'android') return true
  const P = PermissionsAndroid.PERMISSIONS
  const lista =
    Platform.Version >= 31 ? [P.BLUETOOTH_SCAN!, P.BLUETOOTH_CONNECT!] : [P.ACCESS_FINE_LOCATION!]
  const r = await PermissionsAndroid.requestMultiple(lista)
  return lista.every((p) => r[p] === PermissionsAndroid.RESULTS.GRANTED)
}

/**
 * Buscar y emparejar llegaron después que imprimir: una tablet con el build
 * anterior tiene el módulo pero no estas dos funciones, y una actualización
 * por OTA le puede traer esta pantalla igualmente.
 */
export function puedeBuscar(): boolean {
  return typeof ImpresoraBt?.buscar === 'function' && typeof ImpresoraBt?.emparejar === 'function'
}

export async function buscarCercanas(): Promise<DispositivoBt[]> {
  if (!ImpresoraBt || !puedeBuscar()) throw new Error('Actualiza la app para buscar impresoras desde aquí')
  if (!(await pedirPermisosBusqueda())) {
    throw new Error(
      Number(Platform.Version) >= 31
        ? 'Sin permiso de dispositivos cercanos no se pueden buscar impresoras'
        : 'Sin permiso de ubicación Android no deja buscar impresoras',
    )
  }
  if (!ImpresoraBt.bluetoothEncendido()) throw new Error('Enciende el Bluetooth de la tablet')
  const lista = await ImpresoraBt.buscar(15)
  return [...lista].sort((a, b) => Number(b.esImpresora) - Number(a.esImpresora))
}

/** Los PIN de fábrica de casi todas las térmicas de 58 mm, en orden de frecuencia. */
const PINES_COMUNES = ['0000', '1234', '1111', '123456', '000000']

/**
 * Empareja la impresora poniendo el PIN la app. Si la cajera escribió uno
 * (el de la hoja de prueba), se prueba primero ese.
 */
export async function emparejar(mac: string, pin?: string): Promise<DispositivoBt> {
  if (!ImpresoraBt || !puedeBuscar()) throw new Error('Actualiza la app para emparejar desde aquí')
  if (!(await pedirPermisos())) throw new Error('Sin permiso de Bluetooth no se puede emparejar')
  const propio = pin?.trim()
  const pines = propio ? [propio, ...PINES_COMUNES.filter((p) => p !== propio)] : PINES_COMUNES
  return ImpresoraBt.emparejar(mac, pines)
}

let cola: Promise<unknown> = Promise.resolve()

/**
 * Manda los bytes a la impresora del `rol`, `copias` veces, detrás de lo que
 * ya estuviera en cola. Rechaza con un mensaje legible para la cajera.
 *
 * Una sola cola para las dos impresoras: el módulo nativo mantiene una
 * conexión a la vez, y alternar entre ellas a mitad de un envío cortaría
 * el anterior.
 */
export function imprimir(bytes: Uint8Array, copias = 1, rol: Rol = 'tickets'): Promise<void> {
  const trabajo = cola.then(async () => {
    const mac = rol === 'tickets' ? actual.prefs.mac : actual.prefs.etiquetadora.mac
    if (!ImpresoraBt) throw new Error('Esta versión de la app no tiene el módulo de impresora')
    if (!mac) {
      throw new Error(
        rol === 'tickets'
          ? 'Elige la impresora de tickets en el módulo Impresora'
          : 'Elige la etiquetadora en el módulo Impresora › Etiquetas',
      )
    }

    fijar({ estado: 'imprimiendo', error: null })
    try {
      if (!(await pedirPermisos())) throw new Error('Sin permiso de Bluetooth no se puede imprimir')
      const base64 = aBase64(bytes)
      for (let i = 0; i < copias; i++) await ImpresoraBt.escribir(mac, base64)
      fijar({ estado: 'lista' })
    } catch (e) {
      const mensaje = (e as { message?: string }).message ?? 'No se pudo imprimir'
      fijar({ estado: 'error', error: mensaje })
      throw new Error(mensaje)
    }
  })
  // La cola sigue aunque este trabajo falle: el siguiente ticket no debe
  // quedarse atascado detrás de un error.
  cola = trabajo.catch(() => undefined)
  return trabajo
}

export async function desconectar(): Promise<void> {
  await ImpresoraBt?.desconectar()
}
