-- ============================================================================
-- Lumane · 0025 · `p_token` opcional en add_cart_line
-- ============================================================================
-- `add_cart_line` siempre aceptó un token nulo —significa "aún no hay carrito,
-- créalo"—, pero el parámetro no tenía DEFAULT. Los tipos que genera Supabase
-- se basan en eso, así que en TypeScript salía como `string` obligatorio y la
-- llamada legítima sin token no compilaba.
--
-- La alternativa era un cast en el cliente. Un cast solo silencia al
-- compilador; el contrato seguiría diciendo lo que no es. Se arregla donde
-- está el problema: en la firma.
--
-- Como en SQL todo parámetro posterior a uno con DEFAULT necesita el suyo,
-- `p_variant_id` también lo recibe, y se valida explícitamente dentro.
-- ============================================================================

create or replace function public.add_cart_line(
  p_token      text default null,
  p_variant_id uuid default null,
  p_quantity   integer default 1
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.carts%rowtype;
  v_available integer;
  v_new_qty integer;
begin
  -- La firma admite null para que el token pueda omitirse; la variante no.
  if p_variant_id is null then
    raise exception 'Falta indicar la pieza' using errcode = 'invalid_parameter_value';
  end if;
  if p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor que cero' using errcode = 'check_violation';
  end if;

  c := private.resolve_cart(p_token, true);

  if not exists (
    select 1 from public.product_variants v
    join public.products p on p.id = v.product_id
    where v.id = p_variant_id and v.is_active
      and p.status = 'active' and p.is_online
  ) then
    raise exception 'Esta pieza ya no está disponible' using errcode = 'no_data_found';
  end if;

  select coalesce(il.available, 0) into v_available
  from public.inventory_levels il
  where il.variant_id = p_variant_id and il.location_id = private.default_location_id();

  select coalesce(cl.quantity, 0) + p_quantity into v_new_qty
  from (select 1) dummy
  left join public.cart_lines cl on cl.cart_id = c.id and cl.variant_id = p_variant_id;

  if v_new_qty > coalesce(v_available, 0) then
    if coalesce(v_available, 0) = 0 then
      raise exception 'Esta talla se acaba de agotar' using errcode = 'check_violation';
    end if;
    raise exception 'Solo quedan % piezas de esta talla', coalesce(v_available, 0)
      using errcode = 'check_violation';
  end if;

  insert into public.cart_lines (cart_id, variant_id, quantity)
  values (c.id, p_variant_id, p_quantity)
  on conflict (cart_id, variant_id) do update
    set quantity = public.cart_lines.quantity + excluded.quantity,
        updated_at = now();

  return public.get_cart(c.token);
end;
$$;

revoke execute on function public.add_cart_line(text, uuid, integer) from public;
grant execute on function public.add_cart_line(text, uuid, integer) to anon, authenticated;
