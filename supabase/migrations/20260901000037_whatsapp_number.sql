-- ===========================================================================
-- El WhatsApp de la boutique
--
-- Se guarda CON la clave de país (+52). `wa.me` no acepta números locales:
-- limpia todo lo que no sea dígito y lo que queda tiene que ser el número
-- internacional completo, así que un "6684641810" a secas abriría el chat de
-- otro país o ninguno. Escrito así, el pie de página lo muestra legible y el
-- enlace sale correcto sin que nadie tenga que acordarse de anteponer nada.
--
-- Con este dato aparecen solos tres sitios que hasta ahora se ocultaban: la
-- línea de contacto del pie, el bloque "¿No sabes por dónde empezar?" de
-- /colecciones y la franja "¿No encontraste lo que buscabas?" de /buscar.
-- ===========================================================================

update public.store_settings
   set whatsapp_number = '+52 668 464 1810',
       contact_phone   = coalesce(contact_phone, '+52 668 464 1810');
