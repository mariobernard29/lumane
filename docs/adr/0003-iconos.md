# ADR 0003 · Fuente de iconos auto-alojada y subseteada

**Estado:** aceptada · 2026-09-01

## Contexto

El prototipo usa **Material Symbols Outlined** cargada desde Google Fonts.
`next/font/google` no incluye fuentes de iconos, así que no se puede
auto-alojar con el mecanismo habitual.

El archivo variable completo pesa **3.9 MB**: inaceptable para una portada que
debe cargar rápido en el móvil de una clienta.

## Decisión

Descargar el archivo **subseteado a los ~30 glifos que usa el diseño** con el
parámetro `icon_names` de la API de Google Fonts, y servirlo con
`next/font/local`.

Resultado: **10 KB**, auto-alojado, sin petición a un tercero en tiempo de
ejecución.

## Cómo añadir un icono nuevo

1. Añadir el nombre del glifo a la lista de `icon_names`.
2. Regenerar el archivo:

```bash
ICONS="add,arrow_forward,...,tu_icono_nuevo"
curl -sL -A "Mozilla/5.0" \
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,100..700,0..1,0&icon_names=$ICONS" \
  -o /tmp/ms.css
URL=$(grep -o "https://fonts.gstatic.com/l/font?[^)]*" /tmp/ms.css | head -1)
curl -sL -o apps/web/src/app/fonts/material-symbols-outlined.woff2 "$URL"
```

**Si un icono aparece como texto crudo en pantalla** ("arrow_forward" en lugar
del dibujo), es que falta en el subconjunto.
