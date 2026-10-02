import { requireOptionalNativeModule } from 'expo'

/**
 * El puente al módulo nativo `ImpresoraBt` (Bluetooth clásico SPP).
 *
 * Opcional a propósito: en Expo Go, o en un build anterior a este módulo, no
 * existe, y el POS tiene que seguir funcionando —sin botón de imprimir— en vez
 * de romper al arrancar.
 */

export interface DispositivoBt {
  nombre: string
  mac: string
  esImpresora: boolean
}

interface ImpresoraBtNativo {
  bluetoothEncendido(): boolean
  emparejados(): Promise<DispositivoBt[]>
  conectar(mac: string): Promise<void>
  escribir(mac: string, base64: string): Promise<void>
  desconectar(): Promise<void>
  conectada(): boolean
}

export const ImpresoraBt = requireOptionalNativeModule<ImpresoraBtNativo>('ImpresoraBt')
