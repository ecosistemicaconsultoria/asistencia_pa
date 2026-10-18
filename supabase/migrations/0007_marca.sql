-- =====================================================================
-- Migración 0007 · Marca por organización (HU-11)
-- Ecosistémica – Consultoría Ambiental Integral · v0.7 (2026-10-18)
--
-- Cómo aplicarla: Supabase > SQL Editor > New query > pegar todo > Run (una sola vez, después de la 0006).
--
-- Administración cambia el color principal de su organización desde el panel. La función solo toca
-- config.color_primario (las demás reglas de la organización quedan intactas) y deja constancia en la bitácora.
-- La app revisa además que el color tenga buen contraste antes de guardarlo (js/marca.js).
-- =====================================================================

create or replace function public.cambiar_marca(p_organizacion uuid, p_color text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  color  text := upper(trim(coalesce(p_color, '')));
  antes  jsonb;
begin
  if not exists (select 1 from public.miembros
                 where user_id = auth.uid() and organizacion_id = p_organizacion and activo and rol = 'admin') then
    raise exception 'Solo administración cambia la marca de la organización';
  end if;
  if color = '' then
    color := null;   -- vacío: volver al color de omisión
  elsif color !~ '^#[0-9A-F]{6}$' then
    raise exception 'Color inválido: usa el formato #RRGGBB';
  end if;
  select config into antes from public.organizaciones where id = p_organizacion for update;
  update public.organizaciones
     set config = case when color is null then config - 'color_primario' else config || jsonb_build_object('color_primario', color) end
   where id = p_organizacion;
  insert into public.bitacora(organizacion_id, tabla, registro_id, accion, actor, datos)
  values (p_organizacion, 'organizaciones', p_organizacion::text, 'MARCA', auth.uid(),
          jsonb_build_object('color_anterior', antes->'color_primario', 'color_nuevo', color));
  return jsonb_build_object('color_primario', color);
end $$;

revoke all on function public.cambiar_marca(uuid, text) from public, anon;
grant execute on function public.cambiar_marca(uuid, text) to authenticated;
