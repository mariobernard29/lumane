package expo.modules.impresorabt

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Transporte Bluetooth clásico (SPP) hacia la impresora térmica.
 *
 * Solo mueve bytes: qué se imprime lo decide `@lumane/core`. Las impresoras
 * de 58 mm como la Moon58W exponen un puerto serie por RFCOMM, el perfil SPP,
 * no BLE. Por eso no sirve una librería BLE y por eso esto es tan corto.
 *
 * La impresora se empareja UNA vez. Lo normal es hacerlo en los ajustes de
 * Android, pero ahí el PIN se teclea a mano y con prisa, y si falla la
 * impresora nunca aparece; por eso también se puede buscar y emparejar desde
 * aquí, con el PIN puesto por la app.
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
        bt.bondedDevices.map { describir(it) }
      } catch (e: SecurityException) {
        throw ImpresoraException("SIN_PERMISO", "Falta el permiso de Bluetooth", e)
      }
    }

    /**
     * Busca aparatos cercanos SIN emparejar. Para cuando emparejar desde los
     * ajustes de Android falla —el PIN que pide se teclea tarde o mal y la
     * impresora nunca llega a la lista de emparejadas—.
     */
    AsyncFunction("buscar") { segundos: Int, promise: Promise ->
      val bt = adapter
      if (bt == null) {
        promise.reject(ImpresoraException("SIN_BLUETOOTH", "Esta tablet no tiene Bluetooth"))
        return@AsyncFunction
      }
      if (!bt.isEnabled) {
        promise.reject(ImpresoraException("BLUETOOTH_APAGADO", "El Bluetooth está apagado"))
        return@AsyncFunction
      }

      val encontrados = LinkedHashMap<String, Map<String, Any>>()
      val terminado = AtomicBoolean(false)
      // El «terminó» de una búsqueda anterior cancelada aquí mismo llega tarde;
      // sin esto cerraría la nueva antes de encontrar nada.
      var empezo = false
      val principal = Handler(Looper.getMainLooper())
      lateinit var receptor: BroadcastReceiver

      fun terminar() {
        if (!terminado.compareAndSet(false, true)) return
        try { context.unregisterReceiver(receptor) } catch (e: IllegalArgumentException) {}
        try { bt.cancelDiscovery() } catch (e: SecurityException) {}
        promise.resolve(encontrados.values.toList())
      }

      receptor = object : BroadcastReceiver() {
        override fun onReceive(c: Context, intent: Intent) {
          when (intent.action) {
            BluetoothDevice.ACTION_FOUND -> {
              val d = dispositivoDe(intent) ?: return
              try {
                if (d.bondState == BluetoothDevice.BOND_BONDED) return
                encontrados[d.address] = describir(d)
              } catch (e: SecurityException) {}
            }
            BluetoothAdapter.ACTION_DISCOVERY_STARTED -> empezo = true
            BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> if (empezo) terminar()
          }
        }
      }

      try {
        registrar(receptor, IntentFilter().apply {
          addAction(BluetoothDevice.ACTION_FOUND)
          addAction(BluetoothAdapter.ACTION_DISCOVERY_STARTED)
          addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
        })
        if (bt.isDiscovering) bt.cancelDiscovery()
        if (!bt.startDiscovery()) {
          terminado.set(true)
          context.unregisterReceiver(receptor)
          promise.reject(
            ImpresoraException("SIN_BUSQUEDA", "No se pudo buscar. Revisa que la ubicación de la tablet esté encendida")
          )
          return@AsyncFunction
        }
      } catch (e: SecurityException) {
        terminado.set(true)
        try { context.unregisterReceiver(receptor) } catch (e2: IllegalArgumentException) {}
        promise.reject(ImpresoraException("SIN_PERMISO", "Falta el permiso de Bluetooth", e))
        return@AsyncFunction
      }
      // Android corta la búsqueda a los ~12 s; esto es por si no avisa.
      principal.postDelayed({ terminar() }, segundos.coerceIn(5, 30) * 1000L)
    }

    /**
     * Empareja desde la app, poniendo el PIN sin que la cajera lo teclee.
     * Prueba los PIN en orden: si la impresora rechaza uno, Android deshace el
     * intento y se lanza el siguiente. Si el aparato pide confirmar en vez de
     * PIN, Android enseña su propio diálogo y basta con aceptar.
     */
    AsyncFunction("emparejar") { mac: String, pines: List<String>, promise: Promise ->
      val bt = adapter
      if (bt == null) {
        promise.reject(ImpresoraException("SIN_BLUETOOTH", "Esta tablet no tiene Bluetooth"))
        return@AsyncFunction
      }

      val device = try {
        bt.getRemoteDevice(mac)
      } catch (e: IllegalArgumentException) {
        promise.reject(ImpresoraException("MAC_INVALIDA", "Ese aparato no es válido", e))
        return@AsyncFunction
      }

      try {
        if (device.bondState == BluetoothDevice.BOND_BONDED) {
          promise.resolve(describir(device))
          return@AsyncFunction
        }
        bt.cancelDiscovery()
      } catch (e: SecurityException) {
        promise.reject(ImpresoraException("SIN_PERMISO", "Falta el permiso de Bluetooth", e))
        return@AsyncFunction
      }

      val lista = pines.filter { it.isNotBlank() }.ifEmpty { listOf("0000") }
      var intento = 0
      val terminado = AtomicBoolean(false)
      val principal = Handler(Looper.getMainLooper())
      lateinit var receptor: BroadcastReceiver

      fun terminar(error: ImpresoraException?) {
        if (!terminado.compareAndSet(false, true)) return
        principal.removeCallbacksAndMessages(null)
        try { context.unregisterReceiver(receptor) } catch (e: IllegalArgumentException) {}
        if (error != null) promise.reject(error) else promise.resolve(describir(device))
      }

      fun lanzar() {
        try {
          if (!device.createBond()) {
            terminar(ImpresoraException("SIN_EMPAREJAR", "La impresora no respondió. ¿Está encendida y cerca?"))
          }
        } catch (e: SecurityException) {
          terminar(ImpresoraException("SIN_PERMISO", "Falta el permiso de Bluetooth", e))
        }
      }

      receptor = object : BroadcastReceiver() {
        override fun onReceive(c: Context, intent: Intent) {
          val d = dispositivoDe(intent) ?: return
          if (d.address != device.address) return
          try {
            when (intent.action) {
              BluetoothDevice.ACTION_PAIRING_REQUEST -> {
                val variante = intent.getIntExtra(BluetoothDevice.EXTRA_PAIRING_VARIANT, -1)
                if (variante == BluetoothDevice.PAIRING_VARIANT_PIN || variante == VARIANTE_PIN_16) {
                  val pin = lista[intento.coerceAtMost(lista.size - 1)]
                  if (d.setPin(pin.toByteArray()) && isOrderedBroadcast) abortBroadcast()
                }
              }
              BluetoothDevice.ACTION_BOND_STATE_CHANGED -> {
                val ahora = intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, BluetoothDevice.ERROR)
                val antes = intent.getIntExtra(BluetoothDevice.EXTRA_PREVIOUS_BOND_STATE, BluetoothDevice.ERROR)
                when {
                  ahora == BluetoothDevice.BOND_BONDED -> terminar(null)
                  ahora == BluetoothDevice.BOND_NONE && antes == BluetoothDevice.BOND_BONDING -> {
                    intento++
                    if (intento < lista.size) {
                      // Un respiro: relanzar en el mismo instante lo rechaza la pila BT.
                      principal.postDelayed({ if (!terminado.get()) lanzar() }, 800)
                    } else {
                      terminar(
                        ImpresoraException(
                          "PIN_INCORRECTO",
                          "La impresora rechazó el PIN (${lista.joinToString(", ")}). Imprime su hoja de prueba para ver el PIN correcto"
                        )
                      )
                    }
                  }
                }
              }
            }
          } catch (e: SecurityException) {
            terminar(ImpresoraException("SIN_PERMISO", "Falta el permiso de Bluetooth", e))
          }
        }
      }

      registrar(receptor, IntentFilter().apply {
        addAction(BluetoothDevice.ACTION_PAIRING_REQUEST)
        addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED)
        // Antes que el diálogo del sistema, para poner el PIN y ahorrárselo.
        priority = IntentFilter.SYSTEM_HIGH_PRIORITY - 1
      })
      // Tiempo de sobra para aceptar un diálogo de confirmación.
      principal.postDelayed({
        terminar(ImpresoraException("SIN_EMPAREJAR", "La impresora tardó demasiado en responder"))
      }, 60_000L)
      lanzar()
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

      // Tres formas de abrir el mismo puerto, de la más correcta a la más
      // tolerante. Cada intento fallido se cierra: un socket a medio abrir
      // deja el canal ocupado y el siguiente intento falla por eso.
      val intentos: List<() -> BluetoothSocket> = listOf(
        { device.createRfcommSocketToServiceRecord(SPP) },
        // Algunas impresoras baratas rechazan el canal autenticado pero
        // aceptan el inseguro. Es el mismo enlace emparejado.
        { device.createInsecureRfcommSocketToServiceRecord(SPP) },
        // Y otras no anuncian el servicio SPP por SDP («read failed, socket
        // might closed»): se va directo al canal 1, que es donde lo tienen.
        { device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType).invoke(device, 1) as BluetoothSocket },
      )
      var ultimo: IOException? = null
      var nuevo: BluetoothSocket? = null
      for (crear in intentos) {
        val s = try { crear() } catch (e: IOException) { ultimo = e; continue } catch (e: ReflectiveOperationException) { continue }
        try {
          s.connect()
          nuevo = s
          break
        } catch (e: IOException) {
          ultimo = e
          try { s.close() } catch (e2: IOException) {}
        }
      }
      if (nuevo == null) throw ultimo ?: IOException("sin conexión")

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

  private fun describir(d: BluetoothDevice): Map<String, Any> = mapOf(
    "nombre" to (d.name ?: d.address),
    "mac" to d.address,
    // Pista para ordenar la lista: las impresoras se anuncian como
    // «imaging». No se filtra por esto: muchas baratas no lo declaran.
    "esImpresora" to (d.bluetoothClass?.majorDeviceClass == BluetoothClass.Device.Major.IMAGING)
  )

  @Suppress("DEPRECATION")
  private fun dispositivoDe(intent: Intent): BluetoothDevice? =
    if (Build.VERSION.SDK_INT >= 33) {
      intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
    } else {
      intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
    }

  /** Los avisos de Bluetooth los manda el sistema: hay que aceptarlos de fuera. */
  private fun registrar(receptor: BroadcastReceiver, filtro: IntentFilter) {
    if (Build.VERSION.SDK_INT >= 33) {
      context.registerReceiver(receptor, filtro, Context.RECEIVER_EXPORTED)
    } else {
      context.registerReceiver(receptor, filtro)
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
    // `BluetoothDevice.PAIRING_VARIANT_PIN_16_DIGITS` es @hide; algunas
    // impresoras piden el PIN por esta variante.
    private const val VARIANTE_PIN_16 = 7
  }
}

class ImpresoraException(code: String, message: String, cause: Throwable? = null) :
  CodedException(code, message, cause)
