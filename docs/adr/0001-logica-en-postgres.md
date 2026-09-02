# ADR 0001 · La lógica transaccional vive en Postgres

**Estado:** aceptada · 2026-09-01

## Contexto

El ecosistema tiene dos clientes: la tienda en línea (Next.js) y el POS
(Expo / React Native). El POS **no puede ejecutar Server Actions de Next.js**.

Si el cálculo de totales, el descuento de inventario o la validación de cupones
vivieran en el servidor web, el POS necesitaría su propia implementación. Dos
implementaciones de la misma regla divergen siempre; y cuando divergen, la
boutique cobra un precio en mostrador y otro en la web por la misma prenda.

## Decisión

| Tipo de lógica | Dónde vive |
|---|---|
| Transaccional crítica (venta, stock, cupones, caja, devoluciones) | Funciones RPC de Postgres |
| Pura / derivada (formato de moneda, validación de formularios) | `@lumane/core` y `@lumane/ui-web` |
| Integraciones con secretos (Stripe, Google Maps, Resend) | Edge Functions |
| Presentación | `apps/web` y `apps/pos` |

**El cliente nunca envía precios.** Envía `variant_id`, `quantity` y
`coupon_code`; el RPC relee todo de la base y recalcula.

## Consecuencias

**A favor**

- Atomicidad real: una venta se registra completa o no se registra.
- Una sola implementación de cada regla, consumida idénticamente por ambas apps.
- No hay backend propio que mantener, desplegar ni escalar.

**En contra**

- La lógica de negocio está en PL/pgSQL, que se prueba y se depura peor que
  TypeScript. Se compensa con pgTAP y con mensajes de error redactados en
  español y pensados para la interfaz.
- Cambiar una regla exige una migración, no un despliegue. Es más lento a
  propósito: son las reglas que mueven dinero.
