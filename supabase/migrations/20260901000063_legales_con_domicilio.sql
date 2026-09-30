-- ============================================================================
-- Lumane · 0063 · Términos y privacidad: domicilio real, sin RFC ni proveedores
-- ============================================================================
-- Tres cambios que pidió la propietaria:
--
--   1. El domicilio del responsable es el de la boutique (el mismo de la 0061),
--      en los dos textos. Rellena los `[COMPLETAR]` que había en su lugar.
--   2. El RFC no se publica. Se quita de «Quién vende» en los términos.
--   3. Sale la tabla de proveedores del aviso de privacidad (Supabase, Vercel,
--      Stripe…). En su lugar queda una frase con las CATEGORÍAS de proveedor:
--      la Ley pide informar a quién se transfieren los datos, y una frase
--      genérica lo cumple sin anunciar la infraestructura del sitio.
--
-- Con `replace` sobre el texto exacto y no pisando el cuerpo entero: estas
-- páginas se editan desde el panel, y reescribirlas completas borraría
-- cualquier retoque hecho allí. Si algún fragmento ya no está —porque alguien
-- lo cambió a mano— la migración FALLA en vez de dar por hecho un cambio que
-- no ocurrió.
-- ============================================================================

do $$
declare
  domicilio constant text :=
    'Álvaro Obregón 1606, local 3, colonia Jardines del Sol, C.P. 81245, Los Mochis, Sinaloa';
  antes text;
  despues text;
begin
  -- ---------------------------------------------------------------- privacidad
  select body into antes from public.pages where slug = 'privacidad';

  despues := replace(antes,
    'con domicilio en `[COMPLETAR: calle, número, colonia, C.P., Los Mochis, Sinaloa]`',
    'con domicilio en ' || domicilio);
  if despues = antes then raise exception 'privacidad: no encontré el domicilio por completar'; end if;
  antes := despues;

  -- El aviso de borrador daba el domicilio como dato pendiente; ya no lo es.
  despues := replace(antes,
    'exige datos que solo la boutique puede aportar (domicilio fiscal del responsable) y una revisión profesional',
    'exige una revisión profesional');
  if despues = antes then raise exception 'privacidad: no encontré el aviso de borrador'; end if;
  antes := despues;

  despues := replace(antes,
    'Los comparten únicamente los proveedores que hacen funcionar la tienda:',
    'Los comparten únicamente los proveedores que hacen funcionar la tienda: el alojamiento del sitio, '
      || 'el procesamiento de pagos, el envío de correos y las paqueterías que entregan tus pedidos.');
  if despues = antes then raise exception 'privacidad: no encontré la frase de proveedores'; end if;
  antes := despues;

  -- La tabla entera, de la cabecera a la última fila.
  despues := regexp_replace(antes, E'\\n\\n\\| Proveedor \\|.*?\\| México \\|', '', 's');
  if despues = antes then raise exception 'privacidad: no encontré la tabla de proveedores'; end if;

  update public.pages set body = despues where slug = 'privacidad';

  -- ------------------------------------------------------------------ términos
  select body into antes from public.pages where slug = 'terminos';

  despues := replace(antes,
    'con domicilio en `[COMPLETAR: domicilio fiscal]` y RFC `[COMPLETAR]`,',
    'con domicilio en ' || domicilio || ',');
  if despues = antes then raise exception 'terminos: no encontré el domicilio y RFC por completar'; end if;

  update public.pages set body = despues where slug = 'terminos';
end
$$;
