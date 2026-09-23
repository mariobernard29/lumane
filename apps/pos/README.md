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

La tablet lo recoge sola la próxima vez que se abra la app. Nadie tiene que
conectar nada.

**La excepción**: las actualizaciones por aire llevan JavaScript, no código
nativo. Añadir un módulo nativo —la impresión Bluetooth, sin ir más lejos—
obliga a compilar un APK nuevo e instalarlo a mano esa vez.

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
| Impresión | ⏳ los bytes ESC/POS están hechos y probados; falta el transporte Bluetooth |
| Pedidos en línea | ⏳ bandeja en vivo, cambio de estado, devoluciones |
| Inventario | ⏳ Fase 3 |
| Clientes | ⏳ Fase 3 |
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

## Impresión

`@lumane/core` construye los bytes ESC/POS (`buildSaleTicket`) y no sabe nada de
Bluetooth: esa separación es a propósito. Los modelos de impresora térmica son
heterogéneos y lo único comprobable sin tener una delante es que los bytes sean
los correctos — que es lo que está verificado, a 32 y a 48 columnas.

El transporte se conectará cuando haya impresora física con la que probar. El
respaldo previsto sigue en pie: mandar el ticket por WhatsApp.
