# ADR 0004 · El POS usa StyleSheet, no Nativewind

**Estado:** aceptada · 2026-09-19

## Contexto

El plan técnico preveía **Nativewind** para `apps/pos`, con esta salvedad ya
escrita en el registro de riesgos (7b):

> Si Nativewind da problemas, el POS cae a un `theme` de StyleSheet con el mismo
> objeto — sin tocar el diseño de la web.

Al llegar a la instalación, el problema es concreto y no hipotético:

| Pieza | Necesita |
|---|---|
| `apps/web` | Tailwind **v4** (`@theme` CSS-first, ya en producción) |
| Nativewind 4.2.7 | `tailwindcss` **>3.3.0**, con el motor de v3 |
| Expo | pnpm con `node-linker=hoisted` |

Con el enlazado izado, las dos versiones de `tailwindcss` compiten por la misma
carpeta raíz y cuál gane depende del orden de resolución. Es exactamente la
clase de fallo que no aparece en la máquina donde se desarrolla y sí en la
compilación de EAS.

Las salidas posibles eran tres:

1. Bajar `apps/web` a Tailwind 3 — rehacer el `@theme` que ya funciona y está
   verificado contra el prototipo página por página.
2. Fijar versiones a mano y confiar en que el izado no cambie.
3. Prescindir de Nativewind en el POS.

## Decisión

**La tercera.** `apps/pos/src/theme/index.ts` construye el sistema con
`StyleSheet.create` a partir de `@lumane/tokens/native`, que exporta los mismos
colores, la misma tipografía y el mismo espaciado que generan el `@theme` de la
web.

## Consecuencias

**Lo que se pierde:** escribir `className="..."`. Los estilos se componen con
objetos y arrays.

**Lo que NO se pierde —que era lo que importaba:** el sistema de diseño sigue
siendo uno solo. `accent-red` vive en `packages/tokens/src/colors.ts` y cambiarlo
tiñe las dos superficies a la vez. Un color escrito a mano en una pantalla del
POS es tan incorrecto como lo sería en la web.

**Lo que se gana, de propina:** Nativewind resuelve clases en tiempo de
ejecución en cada render. En la pantalla de venta, que pinta una rejilla de
decenas de variantes y se refresca con cada tecla del buscador, un estilo ya
registrado por `StyleSheet.create` es trabajo que no se hace.

**Dos diferencias deliberadas con la web**, ambas en `native.ts` y ambas por
ergonomía, no por estética:

- **Escala tipográfica móvil.** El display de 112 px del escritorio no tiene
  sentido a 40 cm de la cara; se usa el par `-mobile` del prototipo, que es el
  que ya está pensado para esa distancia.
- **Áreas táctiles mayores.** El mínimo pulsable es 56 pt en lugar de 44, y el
  botón de cobrar mide 72. Lo pulsa alguien de pie, con prisa y a veces con una
  prenda en la otra mano.

Los colores no cambian. Ni uno.

## Cómo revertirlo

Si un día Nativewind soporta Tailwind 4, o el POS deja de compartir monorepo
con la web, la vuelta atrás es acotada: `src/theme/index.ts` desaparece y las
pantallas cambian `style={...}` por `className="..."`. Los tokens no se tocan,
porque el generador de `@theme` y el de `native.ts` leen el mismo objeto.
