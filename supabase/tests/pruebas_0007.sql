-- Pruebas de la migración 0007 · marca por organización (HU-11). Datos ficticios.
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

-- Una regla previa que no debe perderse
update organizaciones set config = config || '{"tolerancia_entrada_min": 15}' where id = '22222222-2222-2222-2222-222222222222';

set role authenticated;
\echo '--- M1 coordinación y administración de otra organización no cambian la marca'
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select prueba_debe_fallar($q$select cambiar_marca('11111111-1111-1111-1111-111111111111', '#1E3A8A')$q$, 'Solo administración');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select prueba_debe_fallar($q$select cambiar_marca('11111111-1111-1111-1111-111111111111', '#1E3A8A')$q$, 'Solo administración');

\echo '--- M2 administración cambia el color de la suya; formato validado; las demás reglas quedan'
select prueba_debe_fallar($q$select cambiar_marca('22222222-2222-2222-2222-222222222222', 'azul')$q$, 'Color inválido');
select prueba_debe_fallar($q$select cambiar_marca('22222222-2222-2222-2222-222222222222', '#12345')$q$, 'Color inválido');
select cambiar_marca('22222222-2222-2222-2222-222222222222', '#1e3a8a');
reset role;
do $$ declare c jsonb; begin
  select config into c from organizaciones where id = '22222222-2222-2222-2222-222222222222';
  assert c->>'color_primario' = '#1E3A8A', 'M2 color guardado en mayúsculas';
  assert (c->>'tolerancia_entrada_min')::int = 15, 'M2 no se pierden las demás reglas';
  assert (select count(*) from bitacora where tabla = 'organizaciones' and accion = 'MARCA') = 1, 'M2 queda en la bitácora';
end $$;

\echo '--- M3 vacío: vuelve al color de omisión'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select cambiar_marca('22222222-2222-2222-2222-222222222222', '');
reset role;
do $$ begin
  assert not (select config ? 'color_primario' from organizaciones where id = '22222222-2222-2222-2222-222222222222'), 'M3 sin color propio';
  assert (select (config->>'tolerancia_entrada_min')::int from organizaciones where id = '22222222-2222-2222-2222-222222222222') = 15, 'M3 reglas intactas';
  raise notice 'PRUEBAS 0007: OK';
end $$;
drop function public.prueba_debe_fallar(text, text);
