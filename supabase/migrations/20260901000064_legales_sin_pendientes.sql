-- ============================================================================
-- Lumane · 0064 · Los últimos `[COMPLETAR]` de términos y privacidad
-- ============================================================================
-- Datos que dio la propietaria:
--
--   1. Los datos de una compra se conservan 5 años.
--   2. El pago con tarjeta se describe como algo que ya funciona, no como
--      «cuando se active». Es exacto: el checkout usa el PaymentElement de
--      Stripe, el número de tarjeta se captura en su iframe y nunca toca
--      nuestro servidor. Tampoco guardamos marca ni últimos cuatro dígitos
--      —no hay columna para ellos—, así que el texto no los menciona.
--   3. Los tribunales competentes son los de Los Mochis, Sinaloa.
--
-- El recuadro de «BORRADOR — REVISIÓN LEGAL PENDIENTE» se queda: quitarlo es
-- decidir que los textos ya están revisados, y eso no lo decide una migración.
--
-- Mismo método que la 0063: `replace` sobre el texto exacto, y falla si algún
-- fragmento ya no está.
-- ============================================================================

do $$
declare
  antes text;
  despues text;
begin
  -- ---------------------------------------------------------------- privacidad
  select body into antes from public.pages where slug = 'privacidad';

  despues := replace(antes,
    '**No almacenamos datos de tarjetas bancarias**: cuando se active el pago con tarjeta, esos datos viajan '
      || 'directo a la pasarela y nunca pasan por nuestros servidores.',
    '**No almacenamos datos de tarjetas bancarias.** Cuando pagas con tarjeta, el número, la fecha de '
      || 'vencimiento y el código de seguridad se capturan en un formulario seguro de nuestro procesador de '
      || 'pagos y viajan cifrados directamente a él: nunca pasan por nuestros servidores y nadie en Lumane '
      || 'puede verlos. De ese pago solo recibimos la confirmación de que se aprobó y el importe cobrado.');
  if despues = antes then raise exception 'privacidad: no encontré el párrafo de tarjetas'; end if;
  antes := despues;

  despues := replace(antes,
    'el tiempo que exija la legislación fiscal (`[COMPLETAR: confirmar plazo con contador, típicamente 5 años]`)',
    'durante 5 años, como exige la legislación fiscal');
  if despues = antes then raise exception 'privacidad: no encontré el plazo por completar'; end if;

  update public.pages set body = despues where slug = 'privacidad';

  -- ------------------------------------------------------------------ términos
  select body into antes from public.pages where slug = 'terminos';

  despues := replace(antes,
    'los tribunales de `[COMPLETAR: Los Mochis, Sinaloa]`.',
    'los tribunales de Los Mochis, Sinaloa.');
  if despues = antes then raise exception 'terminos: no encontré los tribunales por completar'; end if;

  update public.pages set body = despues where slug = 'terminos';
end
$$;
