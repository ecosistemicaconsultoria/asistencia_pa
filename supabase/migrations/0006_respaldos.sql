-- =====================================================================
-- Migración 0006 · Registro de respaldos (HU-34, respaldos y conservación)
-- Ecosistémica – Consultoría Ambiental Integral · v0.6 (2026-10-18)
--
-- Cómo aplicarla: Supabase > SQL Editor > New query > pegar todo > Run (una sola vez, después de la 0005).
--
-- Administración descarga desde el panel un respaldo (ZIP con CSV de checadas, revisiones, incidencias y bitácora)
-- y lo guarda fuera de Supabase (p. ej. la unidad compartida de la organización). Aquí queda constancia de cada
-- respaldo: quién, cuándo, qué periodo y la huella SHA-256 de cada archivo, para poder demostrar después que un
-- archivo no se alteró. Es solo-inserción, como las checadas. El servidor fija quién y cuándo.
-- =====================================================================

create table public.respaldos (
  id               uuid primary key default gen_random_uuid(),
  organizacion_id  uuid not null references public.organizaciones(id),
  hecho_por        uuid references public.miembros(id),
  desde            date not null,
  hasta            date not null check (hasta >= desde),
  archivos         jsonb not null default '[]'::jsonb,   -- [{ nombre, filas, sha256 }]
  sha256_zip       text not null check (sha256_zip ~ '^[0-9a-f]{64}$'),
  hecho_en         timestamptz not null default now()
);
create index respaldos_org_en_idx on public.respaldos (organizacion_id, hecho_en desc);

create or replace function public.preparar_respaldo()
returns trigger language plpgsql security definer set search_path = public as $$
declare yo public.miembros%rowtype;
begin
  select * into yo from public.miembros
    where user_id = auth.uid() and organizacion_id = new.organizacion_id and activo and rol = 'admin';
  if not found then raise exception 'Solo administración registra respaldos'; end if;
  if jsonb_typeof(new.archivos) <> 'array' then raise exception 'Lista de archivos inválida'; end if;
  new.hecho_por := yo.id;
  new.hecho_en  := now();
  return new;
end $$;

create trigger respaldos_preparar before insert on public.respaldos
  for each row execute function public.preparar_respaldo();
create trigger respaldos_inalterables before update or delete on public.respaldos
  for each row execute function public.bloquear_modificacion();
create trigger bit_respaldos after insert on public.respaldos
  for each row execute function public.registrar_bitacora();

alter table public.respaldos enable row level security;
create policy res_insertar on public.respaldos for insert to authenticated
  with check (organizacion_id in (select public.mis_organizaciones(array['admin'])));
create policy res_ver on public.respaldos for select to authenticated
  using (organizacion_id in (select public.mis_organizaciones(array['admin'])));

revoke all on public.respaldos from anon;
revoke update, delete, truncate on public.respaldos from authenticated;
grant select, insert on public.respaldos to authenticated;
