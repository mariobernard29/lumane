# Recrear la base de datos desde cero

Todo el esquema vive en `supabase/migrations/` y el contenido inicial en
`supabase/seed.sql`. **La base es reconstruible**: si el proyecto de Supabase se
borra, se pausa o hay que moverlo de cuenta, no se pierde nada del sistema —
solo los datos que se hayan capturado desde el POS o la tienda.

## Qué se pierde y qué no

| | |
|---|---|
| **No se pierde** | Esquema, RLS, RPC, vistas, triggers, catálogo de arranque, menús, páginas, métodos de envío |
| **Sí se pierde** | Pedidos reales, clientas, movimientos de inventario, cortes de caja |

Por eso, en cuanto la boutique empiece a vender de verdad, hay que activar los
respaldos automáticos del proyecto (Supabase los incluye a partir del plan Pro).

## Pasos

### 1. Crear el proyecto

En [supabase.com/dashboard](https://supabase.com/dashboard), nuevo proyecto.
Región recomendada: `us-west-1` o `us-east-2` (las más cercanas a Sinaloa con
buena latencia).

Anota la **contraseña de la base**: hace falta para el paso 3 y no se puede
volver a consultar.

### 2. Actualizar las variables de entorno

En `apps/web/.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<nuevo-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Project Settings → API → publishable>
SUPABASE_SECRET_KEY=<Project Settings → API → service_role>
```

### 3. Aplicar migraciones y siembra

Con el CLI de Supabase (`npm i -g supabase`):

```bash
supabase link --project-ref <nuevo-ref>
supabase db push                      # aplica las 27 migraciones en orden
psql "$DATABASE_URL" -f supabase/seed.sql
```

Sin CLI, desde el editor SQL del panel: pegar cada archivo de
`supabase/migrations/` **en orden numérico** y después `supabase/seed.sql`.
El orden importa: las migraciones se apoyan unas en otras.

### 4. Regenerar los tipos

```bash
pnpm db:types
```

Sin este paso, el editor seguirá creyendo que las columnas nuevas no existen.

### 5. Comprobar

```sql
select
  (select count(*) from public.products)          as productos,      -- 11
  (select count(*) from public.product_variants)  as variantes,      -- 41
  (select count(*) from public.shipping_methods)  as envios,         -- 4
  (select count(*) from public.navigation_items)  as items_nav,      -- 29
  (select sum(on_hand) from public.inventory_levels) as piezas;      -- 102
```

Y en la aplicación: la portada debe mostrar el hero, cuatro categorías con foto
y las novedades.

### 6. Borrar las reseñas de demostración

La siembra no las incluye, pero si se cargaron a mano en algún momento:

```sql
delete from public.product_reviews where customer_id is null and order_id is null;
```

Publicar reseñas inventadas en una tienda real engaña a quien compra.

## Nota sobre el proyecto original

El proyecto `izyoixhffjjodzizkbqk` dejó de resolver por DNS y desapareció de la
sesión MCP durante unas horas. **Estaba PAUSADO, no borrado**: al reactivarlo
volvió íntegro, con sus 11 productos, sus 102 piezas de inventario y sus 26
migraciones aplicadas.

Supabase pausa los proyectos del plan gratuito tras un periodo de inactividad y
mientras están pausados su subdominio deja de resolver, que es exactamente lo
que parece una eliminación. Este documento se escribió durante ese susto y se
queda: el procedimiento hacía falta igual.

## Datos de prueba que hay que borrar antes de abrir

Durante el desarrollo se crearon datos de demostración. **Publicarlos en una
tienda real engaña a quien compra o deja una puerta abierta**:

```sql
-- Reseñas inventadas (se pusieron para poder revisar el diseño de esa sección)
delete from public.product_reviews where customer_id is null and order_id is null;

-- Cuenta de prueba (marina.prueba@ejemplo.mx, con contraseña conocida)
delete from auth.users where email like '%@ejemplo.mx';
```

Borrar el usuario arrastra su fila de `customers` solo si no tiene pedidos; si
los tiene, la fila queda con `auth_user_id` en null, que es lo correcto: el
historial de compras de la boutique no se pierde porque alguien cierre su
cuenta.
