-- ============================================================================
-- Lumane · 0040 · El correo de contacto pasa a contacto@lumane.mx
-- ============================================================================
-- La semilla de la migración 0009 puso `hola@lumane.mx`, que era un supuesto:
-- el buzón que la boutique dio de alta en Hostinger es `contacto@lumane.mx`.
--
-- Va en una migración y no en un UPDATE suelto porque el correo aparece en dos
-- sitios de la base —los ajustes de la tienda y el texto de la política de
-- privacidad— y una base recreada desde cero debe quedar igual que la que está
-- en producción. Un aviso de privacidad que manda a escribir a un buzón que no
-- existe no es un detalle cosmético: es el canal por el que la ley obliga a
-- atender las solicitudes de datos personales.
--
-- No se edita la 0009. Una migración ya aplicada es historia; se corrige
-- encima, nunca por detrás.
-- ============================================================================

update public.store_settings
set contact_email = 'contacto@lumane.mx'
where contact_email = 'hola@lumane.mx';

update public.pages
set body = replace(body, 'hola@lumane.mx', 'contacto@lumane.mx')
where body like '%hola@lumane.mx%';
