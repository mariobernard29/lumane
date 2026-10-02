package expo.modules.impresorabt

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException
import java.util.UUID

/**
 * Transporte Bluetooth clásico (SPP) hacia la impresora térmica.
 *
 * Solo mueve bytes: qué se imprime lo decide `@lumane/core`. Las impresoras
 * de 58 mm como la Moon58W exponen un puerto serie por RFCOMM, el perfil SPP,
 * no BLE. Por eso no sirve una librería BLE y por eso esto es tan corto.
 *
 * La impresora se empareja UNA vez desde los ajustes de Android (PIN 0000 o
 * 1234); aquí solo se listan las ya emparejadas. Escanear exigiría permiso de
 * ubicación y una pantalla de descubrimiento que la cajera no necesita.
 */
class ImpresoraBtModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val adapter: BluetoothAdapter?
    get() = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

  // Una sola conexión viva. `lock` serializa conectar/escribir: dos tickets
  // mandados a la vez por el mismo socket saldrían entrelazados.
  private val lock = Any()
  private var socket: BluetoothSocket? = null
  private var conectadaA: String? = null

  override fun definition() = ModuleDefinition {
    Name("ImpresoraBt")

    Function<Boolean>("bluetoothEncendido") {
      adapter?.isEnabled == true
    }

    AsyncFunction<List<Map<String, Any>>>("emparejados") {
      val bt = adapter ?: throw ImpresoraException("SIN_BLUETOOTH", "Esta tablet no tiene Bluetooth")
      try {
        bt.bondedDevices.map { d ->
          mapOf(
            "nombre" to (d.name ?: d.address),
            "mac" to d.address,
            // Pista para ordenar la lista: las impresoras se anuncian como
            // «imaging». No se filtra por esto: muchas baratas no lo declaran.
            "esImpresora" to (d.bluetoothClass?.majorDeviceClass == BluetoothClass.Device.Major.IMAGING)
          )
        }
      } catch (e: SecurityException) {
        throw ImpresoraException("SIN_PERMISO", "Falta el permiso de Bluetooth", e)
      }
    }

    AsyncFunction("conectar") { mac: String ->
      synchronized(lock) { abrir(mac) }
      Unit
    }

    /**
     * Manda los bytes en base64 (cruza el puente sin conversiones de arrays).
     * Si el socket murió —la impresora se apagó o se durmió— reconecta y
     * reintenta una vez antes de rendirse.
     */
    AsyncFunction("escribir") { mac: String, base64: String ->
      val bytes = Base64.decode(base64, Base64.DEFAULT)
      synchronized(lock) {
        try {
          enviar(abrir(mac), bytes)
        } catch (e: IOException) {
          cerrar()
          try {
            enviar(abrir(mac), bytes)
          } catch (e2: IOException) {
            cerrar()
            throw ImpresoraException("ESCRITURA", "No se pudo imprimir: ${e2.message}", e2)
          }
        }
      }
    }

    AsyncFunction<Unit>("desconectar") {
      synchronized(lock) { cerrar() }
    }

    Function<Boolean>("conectada") {
      socket?.isConnected == true
    }

    OnDestroy {
      synchronized(lock) { cerrar() }
    }
  }

  /** Devuelve el socket abierto a `mac`, abriéndolo si hace falta. */
  private fun abrir(mac: String): BluetoothSocket {
    socket?.let { if (it.isConnected && conectadaA == mac) return it }
    cerrar()

    val bt = adapter ?: throw ImpresoraException("SIN_BLUETOOTH", "Esta tablet no tiene Bluetooth")
    if (!bt.isEnabled) throw ImpresoraException("BLUETOOTH_APAGADO", "El Bluetooth está apagado")

    try {
      val device = bt.getRemoteDevice(mac)
      // El descubrimiento en curso ralentiza o rompe la conexión RFCOMM.
      bt.cancelDiscovery()

      val nuevo = try {
        device.createRfcommSocketToServiceRecord(SPP).also { it.connect() }
      } catch (e: IOException) {
        // Algunas impresoras baratas rechazan el canal autenticado pero
        // aceptan el inseguro. Es el mismo enlace emparejado.
        device.createInsecureRfcommSocketToServiceRecord(SPP).also { it.connect() }
      }

      socket = nuevo
      conectadaA = mac
      return nuevo
    } catch (e: SecurityException) {
      throw ImpresoraException("SIN_PERMISO", "Falta el permiso de Bluetooth", e)
    } catch (e: IllegalArgumentException) {
      throw ImpresoraException("MAC_INVALIDA", "La impresora guardada no es válida", e)
    } catch (e: IOException) {
      throw ImpresoraException("SIN_CONEXION", "No se encontró la impresora. ¿Está encendida?", e)
    }
  }

  /**
   * Por trozos y con una pausa corta: el búfer de recepción de estas
   * impresoras es de pocos KB, y un logo en bits mandado de golpe lo desborda
   * —el resultado es un ticket cortado a la mitad sin ningún error—.
   */
  private fun enviar(s: BluetoothSocket, bytes: ByteArray) {
    val out = s.outputStream
    var i = 0
    while (i < bytes.size) {
      val n = minOf(TROZO, bytes.size - i)
      out.write(bytes, i, n)
      out.flush()
      i += n
      if (i < bytes.size) Thread.sleep(PAUSA_MS)
    }
  }

  private fun cerrar() {
    try {
      socket?.close()
    } catch (e: IOException) {
      // Cerrar un socket ya muerto puede fallar; da igual, se descarta.
    }
    socket = null
    conectadaA = null
  }

  companion object {
    private val SPP: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    private const val TROZO = 512
    private const val PAUSA_MS = 15L
  }
}

class ImpresoraException(code: String, message: String, cause: Throwable? = null) :
  CodedException(code, message, cause)
