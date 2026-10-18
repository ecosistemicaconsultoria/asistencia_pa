-- Pruebas de la migración 0006 · registro de respaldos (HU-34). Se corren después de las demás pruebas SQL. Datos ficticios.
\set ON_ERROR_STOP 1
reset role;

create function public.prueba_debe_fallar(sentencia text, esperado text) returns void language plpgsql as $$
begin
  begin
    execute sentencia;
  exception when others then
    if position(esperado in sqlerrm) = 0 then raise exception 'Falló con otro mensaje: % (se esperaba: %)', sqlerrm, esperado; end if;
    return;
  end;
  raise exception 'Debía fallar y no falló (se esperaba: %)', esperado;
end $$;
grant execute on function public.prueba_debe_fallar(text, text) to authenticated;

set role authenticated;
\echo '--- B1 asesoría y coordinación no registran respaldos'
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select prueba_debe_fallar($q$insert into respaldos(organizacion_id, desde, hasta, sha256_zip) values ('11111111-1111-1111-1111-111111111111', '2026-10-01', '2026-10-31', repeat('a', 64))$q$, 'Solo administración');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select prueba_debe_fallar($q$insert into respaldos(organizacion_id, desde, hasta, sha256_zip) values ('11111111-1111-1111-1111-111111111111', '2026-10-01', '2026-10-31', repeat('a', 64))$q$, 'Solo administración');
do $$ begin assert (select count(*) from respaldos) = 0, 'B1 coordinación no ve respaldos'; end $$;

\echo '--- B2 administración registra el de su organización (no el de otra) y valida los datos'
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select prueba_debe_fallar($q$insert into respaldos(organizacion_id, desde, hasta, sha256_zip) values ('11111111-1111-1111-1111-111111111111', '2026-10-01', '2026-10-31', repeat('a', 64))$q$, 'Solo administración');
select prueba_debe_fallar($q$insert into respaldos(organizacion_id, desde, hasta, sha256_zip) values ('22222222-2222-2222-2222-222222222222', '2026-10-31', '2026-10-01', repeat('a', 64))$q$, 'respaldos_check');
select prueba_debe_fallar($q$insert into respaldos(organizacion_id, desde, hasta, sha256_zip) values ('22222222-2222-2222-2222-222222222222', '2026-10-01', '2026-10-31', 'no-es-huella')$q$, 'sha256_zip_check');
insert into respaldos(organizacion_id, desde, hasta, archivos, sha256_zip, hecho_por, hecho_en) values
 ('22222222-2222-2222-2222-222222222222', '2026-10-01', '2026-10-31', '[{"nombre":"checadas.csv","filas":3,"sha256":"00"}]', repeat('b', 64),
  'aaaaaaaa-0000-0000-0000-000000000001', '2020-01-01');
do $$ begin assert (select count(*) from respaldos) = 1, 'B2 administración ve el suyo'; end $$;
select prueba_debe_fallar($q$update respaldos set sha256_zip = repeat('c', 64)$q$, 'permission denied');
select prueba_debe_fallar($q$delete from respaldos$q$, 'permission denied');

reset role;
select prueba_debe_fallar($q$update respaldos set desde = '2026-09-01'$q$, 'Registro inalterable');
select prueba_debe_fallar($q$delete from respaldos$q$, 'Registro inalterable');
do $$
declare r record;
begin
  select * into r from respaldos;
  -- El servidor fija quién y cuándo, aunque el cliente mande otra cosa
  assert r.hecho_por = 'aaaaaaaa-0000-0000-0000-000000000004', 'B3 quién lo hizo lo fija el servidor';
  assert r.hecho_en > now() - interval '1 minute', 'B3 cuándo lo fija el servidor';
  assert (select count(*) from bitacora where tabla = 'respaldos') = 1, 'B3 queda en la bitácora';
  raise notice 'PRUEBAS 0006: OK';
end $$;
drop function public.prueba_debe_fallar(text, text);
