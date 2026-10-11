package expo.modules.impresorabt

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothSocket
import android.bluetooth.BluetoothStatusCodes
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
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
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Transporte Bluetooth hacia las impresoras térmicas: la de tickets (ESC/POS)
 * y la etiquetadora (TSPL).
 *
 * Solo mueve bytes: qué se imprime lo decide `@lumane/core`.
 *
 * Dos transportes, en este orden:
 *
 *  1. **Clásico (SPP por RFCOMM).** El de casi toda térmica de 58 mm y el de
 *     las etiquetadoras tipo TSC. Se empareja UNA vez, con PIN.
 *  2. **Bluetooth LE (GATT).** Muchas impresoras baratas solo hablan LE: no
 *     se pueden emparejar en los ajustes de Android (el PIN «falla» porque no
 *     hay PIN que poner) y ningún socket RFCOMM las alcanza. Por LE no se
 *     empareja: se conecta y se escribe en su característica de datos.
 *
 * Se recuerda qué transporte funcionó con cada impresora para ir directo la
 * siguiente vez.
 */
@SuppressLint("MissingPermission")
class ImpresoraBtModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val adapter: BluetoothAdapter?
    get() = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

  // Una sola conexión viva. `lock` serializa conectar/escribir: dos tickets
  // mandados a la vez por el mismo canal saldrían entrelazados. Con dos
  // impresoras (tickets y etiquetas), cambiar de una a otra cierra la anterior.
  private val lock = Any()
  private var socket: BluetoothSocket? = null
  private var ble: ConexionBle? = null
  private var conectadaA: String? = null
  private val transporteDe = HashMap<String, String>()

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
     * Busca aparatos cercanos SIN emparejar: los clásicos por descubrimiento
     * y, a la vez, los que solo anuncian Bluetooth LE.
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
      val escaner = try { bt.bluetoothLeScanner } catch (e: SecurityException) { null }

      val escaneoLe = object : ScanCallback() {
        override fun onScanResult(tipo: Int, r: ScanResult) {
          val d = r.device ?: return
          try {
            // Un aparato LE sin nombre es un sensor o un reloj: ruido en la lista.
            val nombre = r.scanRecord?.deviceName ?: d.name ?: return
            if (d.bondState == BluetoothDevice.BOND_BONDED) return
            synchronized(encontrados) {
              if (!encontrados.containsKey(d.address)) encontrados[d.address] = describir(d, nombre)
            }
          } catch (e: SecurityException) {}
        }
      }

      fun terminar() {
        if (!terminado.compareAndSet(false, true)) return
        try { context.unregisterReceiver(receptor) } catch (e: IllegalArgumentException) {}
        try { bt.cancelDiscovery() } catch (e: SecurityException) {}
        try { escaner?.stopScan(escaneoLe) } catch (e: Exception) {}
        synchronized(encontrados) { promise.resolve(encontrados.values.toList()) }
      }

      receptor = object : BroadcastReceiver() {
        override fun onReceive(c: Context, intent: Intent) {
          when (intent.action) {
            BluetoothDevice.ACTION_FOUND -> {
              val d = dispositivoDe(intent) ?: return
              try {
                if (d.bondState == BluetoothDevice.BOND_BONDED) return
                synchronized(encontrados) { encontrados[d.address] = describir(d) }
              } catch (e: SecurityException) {}
            }
            BluetoothAdapter.ACTION_DISCOVERY_STARTED -> empezo = true
            // El descubrimiento clásico acaba a los ~12 s; el escaneo LE sigue
            // hasta el plazo, porque hay impresoras que anuncian despacio.
            BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {}
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
        val clasico = bt.startDiscovery()
        val le = try { escaner?.startScan(escaneoLe); escaner != null } catch (e: Exception) { false }
        if (!clasico && !le) {
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
      principal.postDelayed({ terminar() }, segundos.coerceIn(5, 30) * 1000L)
    }

    /**
     * Empareja desde la app, poniendo el PIN sin que la cajera lo teclee.
     * Prueba los PIN en orden: si la impresora rechaza uno, Android deshace el
     * intento y se lanza el siguiente. Si el aparato pide confirmar en vez de
     * PIN, Android enseña su propio diálogo y basta con aceptar.
     *
     * Una impresora solo LE no se empareja: se devuelve tal cual y se conecta
     * al imprimir.
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
        if (device.bondState == BluetoothDevice.BOND_BONDED || device.type == BluetoothDevice.DEVICE_TYPE_LE) {
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
                    } else if (d.type == BluetoothDevice.DEVICE_TYPE_DUAL) {
                      // Doble modo que rechaza todos los PIN: por LE puede
                      // imprimir igual. Se elige y se prueba al imprimir.
                      terminar(null)
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
     * Si la conexión murió —la impresora se apagó o se durmió— reconecta y
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

    /** Por qué transporte imprime cada impresora: `clasico`, `ble` o null si aún no se sabe. */
    Function("transporte") { mac: String ->
      transporteDe[mac]
    }

    AsyncFunction<Unit>("desconectar") {
      synchronized(lock) { cerrar() }
    }

    Function<Boolean>("conectada") {
      socket?.isConnected == true || ble?.callback?.vivo == true
    }

    OnDestroy {
      synchronized(lock) { cerrar() }
    }
  }

  // ---------------------------------------------------------------------------
  // Conexión
  // ---------------------------------------------------------------------------

  private sealed interface Canal
  private class CanalClasico(val socket: BluetoothSocket) : Canal
  private class CanalBle(val conexion: ConexionBle) : Canal

  /** Devuelve el canal abierto a `mac`, abriéndolo si hace falta. */
  private fun abrir(mac: String): Canal {
    if (conectadaA == mac) {
      socket?.let { if (it.isConnected) return CanalClasico(it) }
      ble?.let { if (it.callback.vivo) return CanalBle(it) }
    }
    cerrar()

    val bt = adapter ?: throw ImpresoraException("SIN_BLUETOOTH", "Esta tablet no tiene Bluetooth")
    if (!bt.isEnabled) throw ImpresoraException("BLUETOOTH_APAGADO", "El Bluetooth está apagado")

    try {
      val device = bt.getRemoteDevice(mac)
      // El descubrimiento en curso ralentiza o rompe la conexión.
      bt.cancelDiscovery()

      val tipo = device.type
      val conocido = transporteDe[mac]
      val probarClasico = tipo != BluetoothDevice.DEVICE_TYPE_LE && conocido != "ble"
      val probarBle = tipo != BluetoothDevice.DEVICE_TYPE_CLASSIC

      var ultimo: IOException? = null
      if (probarClasico) {
        try {
          val s = abrirClasico(device)
          socket = s
          conectadaA = mac
          transporteDe[mac] = "clasico"
          return CanalClasico(s)
        } catch (e: IOException) {
          ultimo = e
        }
      }
      if (probarBle) {
        try {
          val c = abrirBle(device)
          ble = c
          conectadaA = mac
          transporteDe[mac] = "ble"
          return CanalBle(c)
        } catch (e: IOException) {
          ultimo = e
        }
      }
      // Se recordó LE y LE ya no responde: la próxima vez se prueba todo.
      transporteDe.remove(mac)
      throw ultimo ?: IOException("sin conexión")
    } catch (e: SecurityException) {
      throw ImpresoraException("SIN_PERMISO", "Falta el permiso de Bluetooth", e)
    } catch (e: IllegalArgumentException) {
      throw ImpresoraException("MAC_INVALIDA", "La impresora guardada no es válida", e)
    } catch (e: IOException) {
      throw ImpresoraException("SIN_CONEXION", "No se encontró la impresora. ¿Está encendida? (${e.message})", e)
    }
  }

  /**
   * Tres formas de abrir el mismo puerto serie, de la más correcta a la más
   * tolerante. Cada intento fallido se cierra: un socket a medio abrir deja el
   * canal ocupado y el siguiente intento falla por eso.
   */
  private fun abrirClasico(device: BluetoothDevice): BluetoothSocket {
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
    for (crear in intentos) {
      val s = try { crear() } catch (e: IOException) { ultimo = e; continue } catch (e: ReflectiveOperationException) { continue }
      try {
        s.connect()
        return s
      } catch (e: IOException) {
        ultimo = e
        try { s.close() } catch (e2: IOException) {}
      }
    }
    throw ultimo ?: IOException("sin conexión clásica")
  }

  /** Los avisos de GATT llegan por otro hilo; aquí se esperan con cerrojos. */
  private class CallbackBle : BluetoothGattCallback() {
    val conectado = CountDownLatch(1)
    val servicios = CountDownLatch(1)
    val mtu = CountDownLatch(1)
    @Volatile var vivo = false
    @Volatile var mtuValor = 23
    @Volatile var escritura: CountDownLatch? = null
    @Volatile var estadoEscritura = BluetoothGatt.GATT_SUCCESS

    override fun onConnectionStateChange(g: BluetoothGatt, status: Int, nuevo: Int) {
      if (nuevo == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
        vivo = true
        conectado.countDown()
      } else if (nuevo == BluetoothProfile.STATE_DISCONNECTED) {
        vivo = false
        // Todo el que espere, que deje de esperar: la conexión ya no existe.
        conectado.countDown()
        servicios.countDown()
        mtu.countDown()
        escritura?.countDown()
      }
    }

    override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
      servicios.countDown()
    }

    override fun onMtuChanged(g: BluetoothGatt, valor: Int, status: Int) {
      if (status == BluetoothGatt.GATT_SUCCESS) mtuValor = valor
      mtu.countDown()
    }

    override fun onCharacteristicWrite(g: BluetoothGatt, c: BluetoothGattCharacteristic, status: Int) {
      estadoEscritura = status
      escritura?.countDown()
    }
  }

  private class ConexionBle(
    val gatt: BluetoothGatt,
    val caracteristica: BluetoothGattCharacteristic,
    val sinRespuesta: Boolean,
    val trozo: Int,
    val callback: CallbackBle,
  )

  private fun abrirBle(device: BluetoothDevice): ConexionBle {
    val cb = CallbackBle()
    val gatt = device.connectGatt(context, false, cb, BluetoothDevice.TRANSPORT_LE)
      ?: throw IOException("la tablet no pudo abrir Bluetooth LE")

    fun fallar(motivo: String): Nothing {
      try { gatt.disconnect() } catch (e: Exception) {}
      try { gatt.close() } catch (e: Exception) {}
      throw IOException(motivo)
    }

    if (!cb.conectado.await(12, TimeUnit.SECONDS) || !cb.vivo) fallar("no aceptó la conexión LE")
    // Trozos más grandes = impresión más rápida. Si no acepta, quedan 20 bytes.
    if (gatt.requestMtu(185)) cb.mtu.await(3, TimeUnit.SECONDS)
    if (!gatt.discoverServices()) fallar("no enseñó sus servicios")
    if (!cb.servicios.await(10, TimeUnit.SECONDS) || !cb.vivo) fallar("no enseñó sus servicios")

    val c = caracteristicaDeDatos(gatt) ?: fallar("no tiene un canal de impresión por LE")
    val sinRespuesta = c.properties and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0
    return ConexionBle(gatt, c, sinRespuesta, (cb.mtuValor - 3).coerceIn(20, 180), cb)
  }

  /**
   * La característica donde la impresora recibe los bytes. Primero las que
   * usan los fabricantes conocidos; si no, la primera escribible fuera de los
   * servicios estándar (acceso genérico, atributos, información del aparato).
   */
  private fun caracteristicaDeDatos(gatt: BluetoothGatt): BluetoothGattCharacteristic? {
    for ((servicio, caracteristica) in CANALES_CONOCIDOS) {
      val c = gatt.getService(servicio)?.getCharacteristic(caracteristica)
      if (c != null && escribible(c)) return c
    }
    for (s in gatt.services) {
      if (s.uuid in SERVICIOS_ESTANDAR) continue
      for (c in s.characteristics) if (escribible(c)) return c
    }
    return null
  }

  private fun escribible(c: BluetoothGattCharacteristic): Boolean =
    c.properties and (BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0

  private fun enviar(canal: Canal, bytes: ByteArray) {
    when (canal) {
      is CanalClasico -> enviarClasico(canal.socket, bytes)
      is CanalBle -> enviarBle(canal.conexion, bytes)
    }
  }

  /**
   * Por trozos y con una pausa corta: el búfer de recepción de estas
   * impresoras es de pocos KB, y un logo en bits mandado de golpe lo desborda
   * —el resultado es un ticket cortado a la mitad sin ningún error—.
   */
  private fun enviarClasico(s: BluetoothSocket, bytes: ByteArray) {
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

  /**
   * Por LE cada escritura cabe en un paquete (MTU − 3 bytes) y hay que esperar
   * a que la pila la acepte antes de mandar la siguiente.
   */
  private fun enviarBle(con: ConexionBle, bytes: ByteArray) {
    val tipo =
      if (con.sinRespuesta) BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
      else BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
    var i = 0
    while (i < bytes.size) {
      if (!con.callback.vivo) throw IOException("la impresora se desconectó")
      val parte = bytes.copyOfRange(i, minOf(i + con.trozo, bytes.size))
      val espera = CountDownLatch(1)
      con.callback.escritura = espera
      con.callback.estadoEscritura = BluetoothGatt.GATT_SUCCESS

      // La pila responde «ocupada» mientras procesa la anterior: se reintenta.
      var aceptada = false
      for (intento in 0 until 50) {
        aceptada = escribirCaracteristica(con, parte, tipo)
        if (aceptada) break
        Thread.sleep(10)
      }
      if (!aceptada) throw IOException("la impresora no aceptó los datos")
      if (!espera.await(5, TimeUnit.SECONDS)) throw IOException("la impresora dejó de responder")
      if (con.callback.estadoEscritura != BluetoothGatt.GATT_SUCCESS) {
        throw IOException("la impresora rechazó los datos (${con.callback.estadoEscritura})")
      }
      i += parte.size
      // El búfer de estas impresoras es chico: sin respiro, se tragan bytes.
      Thread.sleep(PAUSA_BLE_MS)
    }
  }

  private fun escribirCaracteristica(con: ConexionBle, parte: ByteArray, tipo: Int): Boolean =
    if (Build.VERSION.SDK_INT >= 33) {
      con.gatt.writeCharacteristic(con.caracteristica, parte, tipo) == BluetoothStatusCodes.SUCCESS
    } else {
      escribirAntiguo(con, parte, tipo)
    }

  @Suppress("DEPRECATION")
  private fun escribirAntiguo(con: ConexionBle, parte: ByteArray, tipo: Int): Boolean {
    con.caracteristica.writeType = tipo
    con.caracteristica.value = parte
    return con.gatt.writeCharacteristic(con.caracteristica)
  }

  private fun describir(d: BluetoothDevice, nombre: String? = null): Map<String, Any> = mapOf(
    "nombre" to (nombre ?: d.name ?: d.address),
    "mac" to d.address,
    // Pista para ordenar la lista: las impresoras se anuncian como
    // «imaging». No se filtra por esto: muchas baratas no lo declaran.
    "esImpresora" to (d.bluetoothClass?.majorDeviceClass == BluetoothClass.Device.Major.IMAGING),
    "tipo" to when (d.type) {
      BluetoothDevice.DEVICE_TYPE_CLASSIC -> "clasico"
      BluetoothDevice.DEVICE_TYPE_LE -> "ble"
      BluetoothDevice.DEVICE_TYPE_DUAL -> "dual"
      else -> "desconocido"
    }
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
    ble?.let {
      try { it.gatt.disconnect() } catch (e: Exception) {}
      try { it.gatt.close() } catch (e: Exception) {}
    }
    socket = null
    ble = null
    conectadaA = null
  }

  companion object {
    private val SPP: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    private const val TROZO = 512
    private const val PAUSA_MS = 15L
    private const val PAUSA_BLE_MS = 8L
    // `BluetoothDevice.PAIRING_VARIANT_PIN_16_DIGITS` es @hide; algunas
    // impresoras piden el PIN por esta variante.
    private const val VARIANTE_PIN_16 = 7

    private fun uuid16(corto: String): UUID = UUID.fromString("0000$corto-0000-1000-8000-00805f9b34fb")

    /** Servicio y característica de datos de las familias de impresoras LE más comunes. */
    private val CANALES_CONOCIDOS: List<Pair<UUID, UUID>> = listOf(
      uuid16("18f0") to uuid16("2af1"),
      UUID.fromString("49535343-fe7d-4ae5-8fa9-9fafd205e455") to UUID.fromString("49535343-8841-43f4-a8d4-ecbe34729bb3"),
      uuid16("ff00") to uuid16("ff02"),
      uuid16("ffe0") to uuid16("ffe1"),
      UUID.fromString("e7810a71-73ae-499d-8c15-faa9aef0c3f2") to UUID.fromString("bef8d6c9-9c21-4c9e-b632-bd58c1009f9f"),
    )

    private val SERVICIOS_ESTANDAR: Set<UUID> = setOf(uuid16("1800"), uuid16("1801"), uuid16("180a"), uuid16("180f"))
  }
}

class ImpresoraException(code: String, message: String, cause: Throwable? = null) :
  CodedException(code, message, cause)
