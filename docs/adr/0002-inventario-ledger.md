# ADR 0002 · Inventario como ledger, no como contador

**Estado:** aceptada · 2026-09-01

## Contexto

El requisito es tajante: *"Nunca podrán venderse productos sin stock."* Con una
sola columna `stock` que se suma y se resta, dos ventas simultáneas de la
última pieza pueden pasar ambas, y no queda rastro de por qué el número dejó de
cuadrar.

## Decisión

- **`inventory_movements`** es la verdad: append-only, con un trigger que
  rechaza `UPDATE` y `DELETE`. Corregir un error es escribir un ajuste.
- **`inventory_levels`** es una caché derivada (`on_hand`, `reserved`,
  `available` como columna generada), reconstruible sumando el ledger.
- La garantía vive en la base, no en la aplicación:
  `check (on_hand >= 0 and reserved >= 0 and on_hand - reserved >= 0)`.
- Los RPC bloquean las filas **en orden de `variant_id`** antes de escribir,
  para que dos cajas simultáneas no se traben entre sí.

## Reservas asimétricas

- **POS**: descuenta `on_hand` al instante. La prenda ya salió de la tienda.
- **Web**: solo *reserva* al iniciar el pago, con caducidad (20 min por
  omisión, configurable en `store_settings`), y descuenta al confirmarse.
  Añadir al carrito **no** reserva: si lo hiciera, un carrito abandonado
  congelaría el inventario de la boutique.

## Trampa encontrada durante la implementación

La primera versión del proyector aplicaba el delta con un solo upsert:

```sql
insert into inventory_levels (variant_id, location_id, on_hand)
values (new.variant_id, new.location_id, new.quantity_delta)
on conflict (...) do update set on_hand = il.on_hand + excluded.on_hand;
```

Postgres evalúa los `CHECK` de tabla sobre la **fila propuesta para inserción
antes** de resolver el conflicto. Con un movimiento de venta el delta es
negativo, así que la fila propuesta llevaba `on_hand = -N` y chocaba con el
`CHECK` **aunque hubiera stock de sobra**: ninguna venta podía registrarse.

Peor todavía: la prueba de "sobreventa bloqueada" pasaba por el motivo
equivocado — fallaba siempre, hubiera stock o no.

La corrección (migración `0016`) separa en dos pasos: primero se asegura que la
fila existe proponiendo `on_hand = 0` (siempre válido) y después se aplica el
delta con un `UPDATE`, donde el `CHECK` evalúa el valor real resultante.

**Lección:** una prueba que pasa no demuestra que el sistema funcione; hay que
verificar también el caso que debe TENER ÉXITO, no solo el que debe fallar.

---

## Segunda trampa: el error que se veía como "no hay resultados"

`search_products` (migración 0023) se escribió como SECURITY INVOKER para que
RLS filtrara lo publicado. Pero usa `private.f_unaccent`, y el esquema `private`
tiene el USAGE revocado para `anon`. La función reventaba con
`permission denied for schema private` en cada visita anónima.

El catálogo no se veía roto: se veía **vacío**. Y lo hacía porque la consulta
capturaba el error y devolvía una lista sin elementos sin registrar nada.

Dos correcciones (migración 0024 y `lib/queries/catalog.ts`):

1. La función pasa a SECURITY DEFINER y los predicados de visibilidad
   (`status = 'active' and is_online`) se escriben explícitamente, porque un
   DEFINER ya no puede apoyarse en RLS.
2. El fallo se traza. "El RPC falló" y "no hay piezas que coincidan" son
   estados distintos y no pueden verse igual en pantalla.
