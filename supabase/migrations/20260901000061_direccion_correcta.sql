-- ============================================================================
-- Lumane · 0061 · La dirección correcta y las coordenadas del local
-- ============================================================================
-- La 0060 puso la calle equivocada. El dato original venía como «casi esquina
-- con, Álvaro Obregón, Blvd Canuto Ibarra Guerrero 1606-local 3» y se leyó al
-- revés: se tomó Canuto Ibarra Guerrero como la calle y Álvaro Obregón como la
-- referencia, cuando es justo al contrario.
--
--   Correcto: Álvaro Obregón 1606, local 3, Jardines del Sol, 81245.
--   Canuto Ibarra Guerrero es la transversal, no el domicilio.
--
-- ---------------------------------------------------------------------------
-- Las coordenadas, que no son cosmética
-- ---------------------------------------------------------------------------
-- `locations.lat/lng` tenía `25.7935, -108.9975` — el centro de Los Mochis,
-- sembrado como marcador de posición en la Fase 0. **Es el origen que usa
-- `getDrivingDistance` para cobrar la entrega local**, así que cada envío a
-- domicilio se habría medido desde un punto a algo más de un kilómetro de la
-- puerta.
--
-- Las nuevas salen de la ficha de Google Maps del local:
--
--     .../@25.7956009,-109.0099119,597m/data=...!3d25.7954311!4d-109.0079014
--
-- Se toman `3d` y `4d`, que son las del sitio. El par que va tras la arroba es
-- el centro del encuadre del mapa —dónde estaba mirando la cámara cuando se
-- copió el enlace— y está unos 200 m al oeste. Confundirlos es fácil y deja el
-- alfiler en mitad de la avenida.
-- ============================================================================

update public.locations
set address = jsonb_build_object(
      'street',       'Álvaro Obregón',
      'ext_no',       '1606',
      'int_no',       'Local 3',
      'neighborhood', 'Jardines del Sol',
      'postal_code',  '81245',
      'city',         'Los Mochis',
      'state',        'Sinaloa',
      'country',      'MX',
      -- Deducido: de los dos nombres que dio la propietaria, uno es el
      -- domicilio, así que el otro es la esquina. Si no fuera esta, se corrige
      -- aquí y la página entera cambia con ella.
      'references',   'Casi esquina con Blvd. Canuto Ibarra Guerrero'
    ),
    lat = 25.7954311,
    lng = -109.0079014
where code = 'MOCHIS';

-- El cuerpo de la página repetía la calle equivocada en su primera línea.
update public.pages
set body = E'Estamos sobre Álvaro Obregón, casi esquina con el Blvd. Canuto Ibarra Guerrero, en Jardines del Sol.\n\n'
        || E'Es la única tienda Lumane. Ahí está todo el catálogo, puedes probarte las piezas antes de decidir y '
        || E'una asesora te ayuda con las tallas.\n\n'
        || E'## Recoger un pedido en línea\n\n'
        || E'No cuesta nada. Haz tu pedido en la tienda en línea, elige recoger en boutique y espera nuestro correo '
        || E'de «listo para recoger». Trae una identificación cuando vengas.\n\n'
        || E'## ¿Hay tienda en otra ciudad?\n\n'
        || E'No, es la única. Pero enviamos a todo México con guía rastreable, y dentro de Los Mochis hacemos '
        || E'entrega a domicilio el mismo día o al siguiente.',
    seo_description = 'Visítanos en Álvaro Obregón 1606, local 3, Jardines del Sol, Los Mochis. '
                      || 'Todo el catálogo, pruébate antes de comprar y recoge tus pedidos en línea sin costo.'
where slug = 'la-boutique';
