-- ===========================================================================
-- Fuera el banner falso de Primavera / Verano
--
-- La siembra inicial copió `image_path` en `banner_path`. No son lo mismo:
-- `image_path` es el retrato 4/5 de la tarjeta y `banner_path` la fotografía
-- APAISADA del encabezado de la landing. Estirar un retrato de 600×800 a todo
-- el ancho recorta una franja —o un primer plano de la cara, según por dónde
-- se ancle— y encima lo hace con un tercio de la resolución que necesita.
--
-- Ninguna de las doce fotografías del prototipo es apaisada, así que hoy no
-- hay banner válido para ninguna colección. Se deja el campo vacío: la landing
-- entra directamente al titular, que es correcto, y el encabezado fotográfico
-- aparecerá solo el día que la boutique suba una foto tomada para eso.
-- ===========================================================================

update public.collections
   set banner_path = null,
       banner_alt  = null
 where banner_path = image_path;
