-- ============================================================================
-- Limpieza de los datos de prueba, antes de abrir. DE UN SOLO USO.
-- Ver scripts/limpiar-datos-de-prueba.mjs: correr ese primero (respalda y borra
-- las fotos de Storage), luego pegar esto en Supabase → SQL Editor.
--
-- Todo en una transacción: si algo falla, no se borra nada.
-- ============================================================================
begin;

-- El libro de inventario es append-only por trigger. Se apaga SOLO aquí
-- dentro; el `enable` va en la misma transacción.
alter table public.inventory_movements disable trigger inventory_movements_immutable;
delete from public.inventory_movements;
alter table public.inventory_movements enable trigger inventory_movements_immutable;

delete from public.inventory_reservations;
delete from public.return_lines;
delete from public.returns;
delete from public.product_reviews;
-- Cascada: order_lines, payments, order_status_events, shipments, coupon_redemptions.
delete from public.orders;
delete from public.cash_movements;
delete from public.register_sessions;
delete from public.cart_lines;
delete from public.carts;
delete from public.shipping_quotes;
delete from public.outbox_events;
-- Las clientas con cuenta en la tienda se quedan: sin su fila, la cuenta
-- quedaría huérfana (el trigger que la crea solo corre al registrarse).
delete from public.customers c where c.auth_user_id is null;
-- Cascada: opciones, variantes, imágenes, existencias, categorías y colecciones.
delete from public.products;

commit;

select
  (select count(*) from public.products)            as productos,
  (select count(*) from public.product_variants)    as variantes,
  (select count(*) from public.orders)              as pedidos,
  (select count(*) from public.inventory_movements) as movimientos,
  (select count(*) from public.register_sessions)   as turnos,
  (select tgenabled from pg_trigger where tgname = 'inventory_movements_immutable') as ledger_protegido;
