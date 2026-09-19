-- ===========================================================================
-- El atajo destacado del buscador
--
-- En el prototipo, uno de los chips de "búsquedas populares" lleva contorno
-- negro y el resto gris: es el que la boutique quiere empujar. Marcarlo por su
-- destino ('/rebajas') dejaría la decisión comercial escrita en el código, así
-- que se marca en el dato.
--
-- `eyebrow` está libre en estas filas —son chips de texto, sin imagen ni
-- antetítulo— y es el campo con el nombre más honesto para lo que hace aquí.
-- ===========================================================================

update public.banners
   set eyebrow = 'destacado'
 where slot_key = 'search_popular'
   and cta_href = '/rebajas';
