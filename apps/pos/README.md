# Lumane POS

El punto de venta de la boutique, para la Samsung Galaxy Tab. Expo SDK 57,
expo-router, React Native 0.86.

Comparte base de datos y dominio con la tienda en línea: los mismos RPC de
Postgres, el mismo `@lumane/core` y los mismos `@lumane/tokens`. Una venta en el
mostrador descuenta el inventario que ve la web en el mismo instante, porque no
hay dos bases que conciliar — hay una.

---

## Antes de nada: crear la cuenta de la propietaria

El POS **no tiene registro**. Un punto de venta con un botón de "crear cuenta"
sería una puerta abierta a la caja. Al personal lo da de alta la propietaria.

En el panel de Supabase → **Authentication → Users → Add user**:

- **Email** y **Password**: los que vaya a usar.
- Marca **Auto Confirm User**.
- En **User Metadata**, pega esto:

```json
{
  "user_type": "staff",
  "role": "owner",
  "full_name": "Nombre Apellido"
}
```

El trigger `auth_users_create_staff_profile` (migración 0038) crea sola la fila
de `profiles` con su rol y su sucursal. `role` admite `owner`, `manager` o
`cashier`; si falta o no existe, se cae a `cashier`, que es el rol con menos
permisos — equivocarse por arriba daría accesos que nadie concedió.

Sin `user_type: "staff"` el alta crearía una **clienta**, no personal: el POS
diría "esa cuenta no es de personal de la boutique" y haría bien.

---

## Arrancar en desarrollo

```bash
cp .env.example .env.local     # la llave publicable, nunca la service_role
pnpm --filter @lumane/pos start
```

**Expo Go no sirve** para la versión completa: la impresión Bluetooth necesita
código nativo. Para la interfaz sí vale (`pnpm --filter @lumane/pos start:go`).

Para lo demás hace falta una **compilación de desarrollo**, que se hace en la
nube porque en esta máquina no hay Java ni Android SDK:

```bash
npx eas login                                  # una vez
npx eas build:configure                        # rellena extra.eas.projectId
pnpm --filter @lumane/pos build:dev            # APK con el cliente de desarrollo
```

Se instala el APK en la tablet una vez y a partir de ahí `start` recarga sobre
él como si fuera Expo Go.

Para dar la tablet a la boutique:

```bash
pnpm --filter @lumane/pos build:preview        # APK instalable, sin herramientas
```

---

## Qué está construido

| Módulo | Estado |
|---|---|
| Acceso del personal | ✅ correo y contraseña, sesión en el Keystore de Android |
| Venta | ✅ búsqueda por código de barras, SKU, nombre y categoría; carrito; cobro |
| Cobro | ✅ efectivo con cambio, tarjeta, transferencia y **pagos mixtos** |
| Caja | ✅ apertura con fondo, entradas y salidas, corte con diferencia |
| Impresión | ⏳ los bytes ESC/POS están hechos y probados; falta el transporte Bluetooth |
| Pedidos en línea | ⏳ bandeja en vivo, cambio de estado, devoluciones |
| Inventario | ⏳ Fase 3 |
| Clientes | ⏳ Fase 3 |

---

## Cómo está organizado

```
app/                      rutas (expo-router)
  _layout.tsx             fuentes, pantalla encendida, proveedor de sesión
  index.tsx               guardia: ¿a venta o a ingresar?
  ingresar.tsx            acceso del personal
  (app)/_layout.tsx       carril lateral + guardia de sesión
  (app)/venta/            la pantalla del 90 % del día
  (app)/caja/             apertura, movimientos y corte

src/
  lib/supabase.ts         cliente con sesión en el almacén seguro
  lib/session.tsx         quién soy, qué puedo, hay caja abierta
  theme/                  el sistema de diseño en StyleSheet (ver ADR 0004)
  ui/                     Button, Field, Pending
  features/sale/          carrito, búsqueda y hoja de cobro
```

**Nada de lo que decide dinero vive aquí.** La tablet manda `variant_id`,
`quantity` y `discount_cents`; `pos_create_sale` lee los precios de la base,
recalcula el total y **aborta si los pagos no lo cubren exactamente**. Un APK
modificado cobraría lo mismo.

Los permisos que llegan en `get_my_staff_profile` sirven para **esconder** lo
que no se puede hacer, no para autorizarlo: cada RPC vuelve a comprobarlo contra
la base.

---

## Idempotencia: por qué no se cobra dos veces

El carrito genera un `client_uuid` **antes** de cobrar. Si la tablet pierde el
wifi justo al enviar y reintenta, `pos_create_sale` encuentra ese identificador
en su índice único y devuelve la venta original en lugar de crear otra.

Por eso `reset()` estrena uuid: reutilizarlo haría que la venta siguiente se
tomara por un reintento de la anterior y devolviera el ticket viejo sin cobrar.

---

## Impresión

`@lumane/core` construye los bytes ESC/POS (`buildSaleTicket`) y no sabe nada de
Bluetooth: esa separación es a propósito. Los modelos de impresora térmica son
heterogéneos y lo único comprobable sin tener una delante es que los bytes sean
los correctos — que es lo que está verificado, a 32 y a 48 columnas.

El transporte se conectará cuando haya impresora física con la que probar. El
respaldo previsto sigue en pie: mandar el ticket por WhatsApp.
