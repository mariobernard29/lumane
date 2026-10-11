# Lumane POS

El punto de venta de la boutique, para la Samsung Galaxy Tab. Expo SDK 57,
expo-router, React Native 0.86.

Comparte base de datos y dominio con la tienda en línea: los mismos RPC de
Postgres, el mismo `@lumane/core` y los mismos `@lumane/tokens`. Una venta en el
mostrador descuenta el inventario que ve la web en el mismo instante, porque no
hay dos bases que conciliar — hay una.

---

## Antes de nada: dar de alta al personal

El POS **no tiene registro**. Un punto de venta con un botón de "crear cuenta"
sería una puerta abierta a la caja. Al personal lo da de alta la propietaria,
en dos pasos.

### Paso 1 · Crear la cuenta en el panel

Supabase → **Authentication → Users → Add user → Create new user**:

- **Email Address** y **Password**: los que vaya a usar en la tablet.
- ✅ **Auto Confirm User**. Sin esto la cuenta espera un correo de confirmación
  que nadie manda, y no podría entrar.

Y ya. **No busques dónde poner metadatos: el diálogo no tiene ese campo.**

### Paso 2 · Convertirla en personal

El trigger `auth_users_create_staff_profile` (migración 0038) lee el metadato
`user_type` y crea la fila de `profiles`, pero dispara **`after insert`**. Como
el panel no deja poner metadatos al crear, el trigger no encuentra nada y no
hace nada; y editarlos después tampoco sirve, porque editar es un `update`.

Así que el perfil se crea a mano. Supabase → **SQL Editor**, cambia los tres
valores de arriba y ejecuta:

```sql
with datos as (
  select 'cajera@lumane.mx'::text as correo,   -- el del paso 1
         'cashier'::text          as rol,      -- owner | manager | cashier
         'Nombre Apellido'::text  as nombre
),
marcada as (
  update auth.users u
  set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('user_type', 'staff', 'role', d.rol, 'full_name', d.nombre)
  from datos d
  where u.email = d.correo
  returning u.id, u.email, d.rol, d.nombre
),
perfil as (
  insert into public.profiles (id, full_name, email, role_id, location_id, is_active)
  select m.id, m.nombre, lower(m.email),
         (select r.id from public.roles r where r.key = m.rol),
         (select l.id from public.locations l where l.is_default limit 1),
         true
  from marcada m
  on conflict (id) do update
    set full_name = excluded.full_name,
        role_id   = excluded.role_id,
        is_active = true
  returning id
)
delete from public.customers c
using perfil p
where c.auth_user_id = p.id
  and not exists (select 1 from public.orders o where o.customer_id = c.id)
returning c.id as clienta_huerfana_borrada;
```

Es idempotente: volver a correrlo con los mismos valores no rompe nada, y con
un rol distinto cambia el rol.

**Qué hace cada trozo y por qué está ahí:**

- `marcada` pone el metadato, para que el alta quede documentada en el propio
  usuario y para que el día que la Fase 3 traiga la pantalla de personal —que
  llamará a la API de administración de Auth— el trigger funcione solo.
- `perfil` crea la fila que el trigger no llegó a crear, con la misma lógica.
  `rol` admite `owner`, `manager` o `cashier`. Si escribes un rol que no
  existe, `role_id` sale null y el `insert` falla en vez de inventarse un
  permiso: equivocarse por arriba daría accesos que nadie concedió.
- El `delete` limpia el efecto secundario del rodeo. Cuando la cuenta nace sin
  metadatos, el trigger de la migración 0029 la toma por clienta y le crea su
  fila en `customers`. Sin borrarla, ese correo queda siendo personal **y**
  clienta a la vez: entrar a la tienda en línea con él mostraría un historial
  de compras que no debería existir.

> **La guarda del `delete` no es decorativa.** `orders.customer_id` es
> `on delete set null` y `customer_addresses` y `customer_favorites` van en
> `cascade`. Borrar una clienta con pedidos los desligaría de su dueña y se
> llevaría sus direcciones por delante. Por eso solo borra si no tiene ningún
> pedido — que es siempre el caso de una recién creada, y nunca el de alguien
> que compró de verdad.

### Comprobar que quedó bien

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<el uuid del usuario>","role":"authenticated"}';
select jsonb_pretty(public.get_my_staff_profile());
```

Devuelve exactamente lo que verá la tablet al iniciar sesión: nombre, rol,
permisos ya resueltos, sucursal y si hay caja abierta. Si devuelve `null`, esa
cuenta no es personal y el POS le dirá "esa cuenta no es de personal de la
boutique" — y hará bien.

---

## Las dos compilaciones, que no son lo mismo

Confundirlas cuesta una tarde, así que conviene tenerlo claro desde el
principio:

|  | **development** | **preview** |
|---|---|---|
| Dónde vive el JavaScript | en la máquina que programa, servido por wifi | **dentro del APK** |
| Necesita computadora encendida | sí, siempre | **no** |
| Para qué es | programar y ver cambios al instante | **la boutique** |

En la tienda no va a haber una computadora. La tablet lleva la **preview**; la
**development** no sale de aquí.

### Programar

```bash
cp .env.example .env.local     # la llave publicable, nunca la service_role
pnpm --filter @lumane/pos start
```

La tablet y la máquina, en la misma red. La primera vez que Windows pregunte
por el firewall, permite **redes privadas** o la tablet se quedará en
"Connecting…" para siempre.

**Expo Go no sirve** para la versión completa: la impresión Bluetooth necesita
código nativo. Para mirar interfaz sí vale
(`pnpm --filter @lumane/pos start:go`).

El APK de desarrollo se compila en la nube, porque en esta máquina no hay Java
ni Android SDK:

```bash
npx eas login                                  # una vez
pnpm --filter @lumane/pos build:dev
```

El proyecto de EAS ya existe y su `projectId` está en `app.json`; **no vuelvas
a correr `eas init`**. Cada comando de EAS que toca `app.json` lo reescribe
resuelto y ha metido ya dos veces permisos que no queríamos — si lo corres,
revisa el diff antes de confirmar.

### Dar la tablet a la boutique

```bash
pnpm --filter @lumane/pos build:preview        # APK autónomo
```

Se instala una vez desde el enlace que imprime EAS y ya está: se abre sola, sin
cable y sin terminal. Solo necesita wifi para hablar con Supabase.

Comparte identificador (`mx.lumane.pos`) con la de desarrollo, así que **una
reemplaza a la otra**: no pueden convivir en la misma tablet.

### Actualizar sin pisar la tienda

```bash
pnpm --filter @lumane/pos start                # probar el cambio aquí
npx eas update --channel preview               # publicarlo
```

La tablet lo busca al volver a primer plano y cada 15 minutos, lo descarga en
segundo plano y enseña arriba **«Hay una versión nueva de Lumane POS lista ·
Actualizar ahora»**. No se reinicia sola: puede haber una venta a medias.
Nadie tiene que conectar nada (ver `src/lib/actualizaciones.tsx`).

**La excepción**: las actualizaciones por aire llevan JavaScript, no código
nativo. Un cambio nativo —un permiso, la orientación, el Bluetooth— obliga a
compilar un APK nuevo. Para que la tablet se entere sola:

1. Sube `version` en `app.json` (`1.1.0` → `1.2.0`). La versión es también
   el `runtimeVersion`: las actualizaciones por aire de una versión no llegan
   a APKs de otra, que es justo lo que evita mandar JavaScript nuevo a un
   nativo viejo que no lo soporta.
2. `pnpm --filter @lumane/pos build:preview` y copia el enlace del APK.
3. Apunta la tablet al APK nuevo en Supabase → SQL Editor:

   ```sql
   insert into public.pos_release (version, apk_url, notas)
   values ('1.2.0', 'https://expo.dev/artifacts/eas/….apk', 'Qué trae, en una línea')
   on conflict (id) do update
     set version = excluded.version, apk_url = excluded.apk_url,
         notas = excluded.notas, published_at = now();
   ```

   Las tablets con una versión menor enseñan **«Hay que instalar la versión
   1.2.0 · Descargar»**. Se baja y se instala encima; no se pierde nada.

### Verla en la computadora

```bash
pnpm --filter @lumane/pos web
```

Abre el POS en el navegador (http://localhost:8081) contra la base real, para
revisar pantallas sin tablet ni emulador. Sin Bluetooth: Impresora dice que
falta el módulo. La sesión va a `localStorage` (`src/web/secure-store.ts`,
que Metro solo usa en web); el APK sigue usando el Keystore. Para probar la
vertical, pon la ventana más alta que ancha.

### Antes de compilar, dos cosas que muerden

- **Las variables viven en `eas.json`, no en `.env.local`.** EAS sube a la nube
  solo lo que git rastrea, y `.env*.local` está en `.gitignore`. Una llave que
  solo esté en el archivo local produce un APK sin URL de Supabase que revienta
  en la pantalla de ingreso sin decir por qué. Son llaves públicas —viajan
  dentro del APK de todos modos—, así que estar en el repo no cambia nada.
- **`pnpm install` tiene que salir con código 0.** El servidor de EAS instala
  antes de compilar; si algo en `pnpm-workspace.yaml` lo hace fallar, la
  compilación muere sin explicar el motivo.

---

## Qué está construido

| Módulo | Estado |
|---|---|
| Acceso del personal | ✅ correo y contraseña, sesión en el Keystore de Android |
| Venta | ✅ búsqueda por código de barras, SKU, nombre y categoría; carrito; cobro |
| Cobro | ✅ efectivo con cambio, tarjeta, transferencia y **pagos mixtos** |
| Caja | ✅ apertura con fondo, entradas y salidas, corte con diferencia |
| Impresión de tickets | ✅ ESC/POS por Bluetooth clásico o LE: venta, reimpresión, corte |
| Etiquetas de prendas | ✅ TSPL para la Hanna58: monograma, nombre, talla, precio, código y SKU |
| Pedidos en línea | ✅ bandeja en vivo, cambio de estado, devoluciones |
| Inventario y Clientes | ✅ |
| Horizontal y vertical | ✅ en vertical el carril pasa a barra superior |
| Aviso de versión nueva | ✅ por aire y de APK (`pos_release`) |
| Icono y splash | ⛔ **faltan**: hace falta arte a 1024×1024 |

> El icono es lo único de esta lista que se ve **desde fuera del mostrador**.
> Sin él, la tablet muestra el genérico de Expo en su pantalla de inicio, a la
> vista de quien esté pagando. Los del sitio no sirven: miden 28×28 y 150×54.

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

## Etiquetas de prendas

La Hanna58 de SICAR es una **etiquetadora TSPL**, no una impresora de tickets:
no entiende ESC/POS, y la Moon58W no entiende TSPL. Por eso son dos impresoras
con su propia MAC en Impresora › Tickets y Impresora › Etiquetas.

- **Etiquetas** (módulo del carril): se escanea o busca la prenda, cada toque
  suma una etiqueta, «Imprimir» las manda. Desde la ficha de una prenda,
  «Etiquetas» trae todas sus tallas con una copia por pieza en existencia.
- **Impresora › Etiquetas**: la medida del rollo (catálogo de 14, de 30×20 a
  58×60 y colgantes, o una a mano), oscuridad, velocidad, desplazamiento y
  giro. «Imprimir etiqueta de prueba» saca un recuadro al borde: si sale
  cortado o corrido, se ajusta el desplazamiento.
- La plantilla vive en `@lumane/core` (`etiqueta.ts`, `tspl.ts`) y se compone
  para la medida. Las pruebas comprueban en los 14 tamaños que nada se salga
  ni se encime; la vista previa de la pantalla se dibuja con los mismos bytes.
- El código de barras es el **SKU** en Code 128, o el EAN-13 del proveedor si
  la variante lo tiene. El escáner de Venta lo reconoce aunque el SKU sea
  prefijo de otro.

## Impresión

`@lumane/core` construye los bytes ESC/POS (`buildSaleTicket`) y no sabe nada de
Bluetooth: esa separación es a propósito. Los modelos de impresora térmica son
heterogéneos y lo único comprobable sin tener una delante es que los bytes sean
los correctos — que es lo que está verificado, a 32 y a 48 columnas.

El transporte es `modules/impresora-bt`, un módulo nativo propio:

1. **Bluetooth clásico (SPP)**: canal seguro, inseguro y RFCOMM 1, en ese orden.
2. **Bluetooth LE (GATT)**: para las impresoras baratas que solo hablan LE. No
   se emparejan (por eso el PIN «fallaba» en los ajustes de Android): se
   buscan en Impresora › «Emparejar desde aquí», se tocan y se usan.

Se recuerda qué transporte funcionó con cada impresora, y Impresora lo enseña
(«Bluetooth LE» o «clásico») junto al nombre.

> **Si los tickets no salen**, lo primero es la versión de la app: el APK
> anterior al 11 de octubre de 2026 no traía ni la conexión tolerante ni LE.
> Con el APK nuevo: Impresora › Tickets › Emparejar desde aquí › Buscar,
> tocar la Moon58W, «Imprimir página de prueba».
