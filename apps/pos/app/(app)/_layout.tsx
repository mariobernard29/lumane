import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { Redirect, Slot, usePathname, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

import { OrdersProvider, useOrders } from '@/features/orders/OrdersContext'
import { useSession } from '@/lib/session'
import { color, s, size, space, text } from '@/theme'

/**
 * El marco del POS.
 *
 * Carril lateral, no pestañas inferiores. La tablet se usa en horizontal sobre
 * un mostrador: abajo está el borde que tapa la mano al escribir, y a la
 * izquierda queda el pulgar de quien la sostiene. Es también donde cabe el
 * nombre de cada módulo sin abreviarlo a un icono adivinable.
 *
 * Aquí vive la guarda de sesión: todo lo que cuelgue de esta carpeta exige
 * personal autenticado, y las pantallas de dentro pueden usar `useStaff()` sin
 * comprobar nada.
 */

interface Modulo {
  href: '/venta' | '/caja' | '/pedidos' | '/inventario' | '/clientes'
  label: string
  /** Sin este permiso el módulo no se pinta: no se ofrecen callejones sin salida. */
  permission: string
  /** Pinta el número de pedidos que esperan. Solo Pedidos lo lleva. */
  contador?: true
}

const MODULOS: Modulo[] = [
  { href: '/venta', label: 'Venta', permission: 'sales.create' },
  { href: '/caja', label: 'Caja', permission: 'register.open' },
  { href: '/pedidos', label: 'Pedidos', permission: 'orders.read', contador: true },
  { href: '/inventario', label: 'Inventario', permission: 'inventory.read' },
  { href: '/clientes', label: 'Clientes', permission: 'customers.read' },
]

/**
 * La guarda y el proveedor. El marco va aparte porque `useOrders()` tiene que
 * leerse POR DEBAJO de `OrdersProvider`, y un componente no puede consumir un
 * contexto que él mismo monta.
 */
export default function AppLayout() {
  const { loading, staff } = useSession()

  if (loading) {
    return (
      <View style={[s.screen, s.center]}>
        <ActivityIndicator color={color.primary} size="large" />
      </View>
    )
  }

  if (!staff) return <Redirect href="/ingresar" />

  return (
    <OrdersProvider>
      <Marco />
    </OrdersProvider>
  )
}

function Marco() {
  const { staff, can, signOut } = useSession()
  const { pendientes } = useOrders()
  const router = useRouter()
  const pathname = usePathname()

  // `AppLayout` ya garantizó que hay sesión; esto solo estrecha el tipo.
  if (!staff) return null

  const visibles = MODULOS.filter((m) => can(m.permission))

  return (
    <SafeAreaView style={l.marco} edges={['top', 'bottom', 'left']}>
      <View style={l.carril}>
        <View style={l.marca}>
          {/* Versión en hueso: el carril es negro editorial y el logotipo en
              tinta sería invisible sobre él. */}
          <Image
            source={require('../../assets/logotipo-hueso.png')}
            style={l.logotipo}
            resizeMode="contain"
            accessibilityRole="image"
            accessibilityLabel="LUMANE"
          />
          <Text style={[s.label, l.marcaPie]} numberOfLines={1}>
            {staff.location.code}
          </Text>
        </View>

        <View style={l.modulos}>
          {visibles.map((modulo) => {
            const activo = pathname.startsWith(modulo.href)
            return (
              <Pressable
                key={modulo.href}
                onPress={() => router.replace(modulo.href)}
                accessibilityRole="tab"
                accessibilityState={{ selected: activo }}
                style={({ pressed }) => [
                  l.modulo,
                  activo && l.moduloActivo,
                  pressed && !activo && l.moduloPulsado,
                ]}
              >
                <Text style={[l.moduloTexto, activo && l.moduloTextoActivo]}>{modulo.label}</Text>
                {/* El contador solo aparece cuando hay algo que atender: un «0»
                    permanente en el carril se vuelve invisible a los dos días y
                    deja de avisar cuando de verdad importa. */}
                {modulo.contador && pendientes > 0 ? (
                  <View style={l.globo}>
                    <Text style={l.globoTexto}>{pendientes}</Text>
                  </View>
                ) : null}
              </Pressable>
            )
          })}
        </View>

        {/* Quién está cobrando, siempre visible. En un mostrador con turnos,
            saber a nombre de quién se está registrando cada venta importa más
            que ganar el espacio. */}
        <Pressable
          onPress={() => void signOut()}
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesión"
          style={({ pressed }) => [l.cajera, pressed && l.moduloPulsado]}
        >
          <Text style={[s.label, l.cajeraRol]} numberOfLines={1}>
            {staff.role.name}
          </Text>
          <Text style={[s.body, s.onDark]} numberOfLines={1}>
            {staff.full_name}
          </Text>
          <Text style={[s.label, l.salir]}>Salir</Text>
        </Pressable>
      </View>

      <View style={s.fill}>
        <Slot />
      </View>
    </SafeAreaView>
  )
}

const l = StyleSheet.create({
  marco: { flex: 1, flexDirection: 'row', backgroundColor: color.surface },
  carril: {
    width: 168,
    backgroundColor: color['editorial-ink'],
    paddingVertical: space.gutter,
  },
  marca: { paddingHorizontal: space.gutter, paddingBottom: space.sectionSm },
  // 136 px útiles en el carril (168 menos los dos gutter). 120 deja aire a los
  // lados; la altura sale de la proporción 2.75:1 del arte.
  logotipo: { width: 120, height: 44, marginBottom: 2 },
  marcaPie: { color: color['on-primary-container'], marginTop: 2 },
  modulos: { flex: 1, gap: 2 },
  modulo: {
    minHeight: size.touchMin,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.gap,
    paddingHorizontal: space.gutter,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  // Relleno claro sobre el carril negro: es el único elemento del POS que
  // tiene que verse de reojo desde el otro lado del mostrador.
  globo: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignItems: 'center',
    backgroundColor: color['on-primary'],
  },
  globoTexto: { ...text.labelUpper, fontSize: 11, color: color['editorial-ink'] },
  moduloActivo: {
    backgroundColor: color['on-primary-fixed-variant'],
    borderLeftColor: color['on-primary'],
  },
  moduloPulsado: { backgroundColor: color['on-primary-fixed-variant'] },
  moduloTexto: { ...text.navLink, color: color['on-primary-container'] },
  moduloTextoActivo: { color: color['on-primary'] },
  cajera: {
    borderTopWidth: 1,
    borderTopColor: color['on-primary-fixed-variant'],
    paddingHorizontal: space.gutter,
    paddingTop: space.gap,
    gap: 2,
  },
  cajeraRol: { color: color['on-primary-container'] },
  salir: { color: color['on-primary-container'], marginTop: 6 },
})
