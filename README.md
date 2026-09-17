# Lumane

Ecosistema de la boutique **Lumane** (Los Mochis, Sinaloa): punto de venta y
tienda en línea sobre **una sola base de datos y una sola lógica de negocio**.

```
apps/web        Tienda en línea · Next.js 16 · App Router · Tailwind v4
apps/pos        POS para Galaxy Tab · Expo / React Native        (Fase 2)
packages/tokens Design tokens portados del prototipo
packages/ui-web Sistema de diseño web
packages/db     Cliente tipado de Supabase
packages/core   Dominio puro compartido                           (Fase 2)
supabase/       Migraciones SQL versionadas + siembra
prototipo/      Maqueta HTML original · referencia visual, no se toca
docs/adr/       Decisiones de arquitectura y por qué
```

## Puesta en marcha

```bash
corepack enable          # o: npm i -g pnpm
pnpm install
cp apps/web/.env.example apps/web/.env.local   # y rellenar las llaves
pnpm --filter @lumane/web dev
```

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Arranca todo lo que tenga script `dev` |
| `pnpm typecheck` | TypeScript en todo el monorepo |
| `pnpm build` | Build de producción |
| `pnpm db:types` | Regenera los tipos desde el esquema de Supabase |

> **Tras cada migración hay que correr `pnpm db:types`.** Si no, el editor
> seguirá creyendo que una columna nueva no existe.

## Reglas del proyecto

1. **El cliente nunca envía precios.** Manda `variant_id` y `quantity`; el RPC
   recalcula contra la base. Ver [ADR 0001](docs/adr/0001-logica-en-postgres.md).
2. **Ningún texto ni imagen del sitio vive en el código.** Todo sale de la base
   y se administra desde el POS.
3. **Ninguna pantalla inventa estilos.** Si algo no se puede construir con
   `@lumane/ui-web` y los tokens, falta una variante en el sistema de diseño.
4. **Los precios incluyen IVA (16%).** El impuesto se desglosa del total, no se
   suma. `orders.tax_cents` guarda la parte desglosada.
5. **El dinero se guarda en centavos** (`bigint`). Nunca `float`.

## Estado

- **Fase 0 · Cimientos** — completa: monorepo, tokens, esquema con RLS,
  motor de precios, RPC de venta y checkout, siembra del catálogo.
- **Fase 1 · Tienda en línea** — portada, catálogo con filtros, ficha de producto,
  carrito, checkout, área de clienta y páginas de contenido terminados.
  Falta activar el pago con tarjeta (Stripe) y el envío de correos (Resend).
