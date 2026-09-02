-- ============================================================================
-- Lumane · 0001 · Extensiones, esquema privado y helpers transversales
-- ============================================================================
-- Decisiones documentadas:
--   * PK = uuid v7 (ordenable por tiempo). Postgres 17 aún no trae uuidv7()
--     nativo (llega en PG18) y el proyecto no tiene la extensión pg_uuidv7,
--     así que se implementa en SQL. Evita la fragmentación de índice del uuid v4.
--   * Dinero = bigint en CENTAVOS. Nunca float, nunca numeric: las sumas de
--     centavos son exactas y baratas, y el redondeo se decide una sola vez.
--   * Los helpers viven en el esquema `private`, no expuesto por PostgREST,
--     para poder usarlos en políticas RLS sin volverlos API pública.
-- ============================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- uuid v7: timestamp de 48 bits + aleatorio, ordenable por tiempo.
-- Los 6 primeros bytes se sustituyen por los milisegundos de época y se marca
-- la versión 7 en el nibble alto del byte 6 (bits 52 y 53 en la numeración
-- LSB-por-byte que usa set_bit sobre bytea).
-- ---------------------------------------------------------------------------
create or replace function private.uuid_generate_v7()
returns uuid
language sql
volatile
parallel safe
set search_path = ''
as $$
  select encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          placing substring(
            int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint)
            from 3
          )
          from 1 for 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid;
$$;

comment on function private.uuid_generate_v7() is
  'UUID v7 (time-ordered). Default de todas las PK del proyecto.';

-- ---------------------------------------------------------------------------
-- updated_at automático. Se adjunta a cada tabla mutable.
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- slugify: normaliza acentos y espacios para URLs amigables.
-- Se usa como respaldo cuando el administrador no captura un slug propio.
-- ---------------------------------------------------------------------------
create or replace function private.slugify(input text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(lower(extensions.unaccent(coalesce(input, ''))), '[^a-z0-9]+', '-', 'g'),
      '-{2,}', '-', 'g'
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Impuestos. Los precios de Lumane YA INCLUYEN IVA (estándar del retail en
-- México y lo que muestra el prototipo). Por eso el impuesto se DESGLOSA del
-- total, no se suma: iva = total * tasa / (1 + tasa).
-- La tasa vigente vive en store_settings (migración 0010), no en el código.
-- ---------------------------------------------------------------------------
create or replace function private.extract_tax_cents(total_cents bigint, tax_rate numeric)
returns bigint
language sql
immutable
parallel safe
set search_path = ''
as $$
  select round(total_cents * tax_rate / (1 + tax_rate))::bigint;
$$;

comment on function private.extract_tax_cents(bigint, numeric) is
  'Desglosa el IVA contenido en un total que ya lo incluye.';
