#!/usr/bin/env bash
# Prueba el manual de réplica (HU-38): instala la base con supabase/instalacion_completa.sql en un Postgres 16 + PostGIS
# limpio y corre, tal cual, los bloques SQL de docs/REPLICA.md con valores de ejemplo (organización y parques FICTICIOS).
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../.." && pwd)"
DOC="$RAIZ/docs/REPLICA.md"
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
DIR=$(mktemp -d); chown postgres "$DIR"
su postgres -c "$PGBIN/initdb -D $DIR -A trust >/dev/null && $PGBIN/pg_ctl -D $DIR -l $DIR/log -o '-p 5496 -k /tmp' start >/dev/null"
trap 'su postgres -c "$PGBIN/pg_ctl -D $DIR stop -m fast" >/dev/null; rm -rf "$DIR"' EXIT
for _ in $(seq 1 20); do psql -h /tmp -p 5496 -U postgres -qtAc 'select 1' >/dev/null 2>&1 && break; sleep 0.5; done
P="psql -h /tmp -p 5496 -U postgres -q -v ON_ERROR_STOP=1 -d t"
psql -h /tmp -p 5496 -U postgres -qc "create database t"
$P -f "$AQUI/stub_supabase.sql"
$P -f "$RAIZ/supabase/instalacion_completa.sql" >/dev/null                      # opción B, paso B2
$P -c "alter table auth.users add column email text;
       insert into auth.users values ('00000000-0000-0000-0000-0000000000bb', 'admin@iap-ficticia.test');"

bloque() { awk -v n="$1" '/^```sql/{c++; dentro=(c==n); next} /^```/{dentro=0} dentro' "$DOC" | sed -e "s/correo@de.la.persona/admin@iap-ficticia.test/g"; }
cuenta() { $P -tAc "$1"; }
falla() { echo "REPLICA: FALLA — $1"; exit 1; }
ORG="(select id from organizaciones where slug = 'iap-ejemplo')"

# Paso 2: organización + administración; dos veces no duplica; un correo inexistente avisa claro
bloque 1 | $P >/dev/null 2>&1
bloque 1 | $P >/dev/null 2>&1
[ "$(cuenta "select count(*) from organizaciones where slug = 'iap-ejemplo' and nombre = 'IAP Ejemplo'")" = 1 ] || falla "paso 2 organización"
[ "$(cuenta "select count(*) from miembros where organizacion_id = $ORG and rol = 'admin' and user_id = '00000000-0000-0000-0000-0000000000bb'")" = 1 ] || falla "paso 2 administración"
SALIDA=$(bloque 1 | sed "s/admin@iap-ficticia.test/nadie@iap-ficticia.test/" | $P 2>&1 || true)
echo "$SALIDA" | grep -q "No existe el usuario nadie@iap-ficticia.test" || falla "paso 2 sin usuario"
# La persona de administración ya es administración por RLS
[ "$($P -tAc "set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000bb'; select count(*) from mis_organizaciones(array['admin']);" | tail -1)" = 1 ] || falla "paso 2 RLS"

# Paso 3: reglas (se fusionan con las de omisión)
bloque 2 | $P >/dev/null
[ "$(cuenta "select config->>'medio_dia_libre_por' || ',' || (config->>'jornada_semanal_horas') || ',' || (config->>'color_primario') from organizaciones where slug = 'iap-ejemplo'")" = "semana,40,#14503A" ] || falla "paso 3 reglas"

# Paso 4: tabla de carga, "importación del CSV", copia a sitios (sin duplicar) y limpieza
bloque 3 | $P >/dev/null
$P -c "insert into carga_sitios (clave, nombre, colonia, tipo, lat, lon, radio_m, perimetro_geojson) values
  ('F-1', 'Parque Ficticio Uno', 'Centro', '', 24.80, -107.40, null, '{\"type\":\"Polygon\",\"coordinates\":[[[-107.4004,24.7996],[-107.3996,24.7996],[-107.3996,24.8004],[-107.4004,24.8004],[-107.4004,24.7996]]]}'),
  ('F-2', 'Parque Ficticio Dos', '', '', 24.81, -107.41, 60, ''),
  ('O-1', 'Oficina Ficticia', 'Centro', 'oficina', 24.79, -107.39, null, null);"
bloque 4 | $P >/dev/null
bloque 4 | $P >/dev/null
[ "$(cuenta "select count(*) || ',' || count(perimetro) || ',' || count(*) filter (where tipo = 'oficina') from sitios where organizacion_id = $ORG")" = "3,1,1" ] || falla "paso 4 sitios"
[ "$(cuenta "select radio_m || ',' || (perimetro_geojson->>'type') from v_sitios_app where clave_externa = 'F-1'")" = "80,MultiPolygon" ] || falla "paso 4 vista de la app"
[ "$(cuenta "select radio_m from v_sitios_app where clave_externa = 'F-2'")" = 60 ] || falla "paso 4 radio propio"
bloque 5 | $P >/dev/null
[ "$(cuenta "select to_regclass('public.carga_sitios') is null")" = t ] || falla "paso 4 limpieza"

echo "REPLICA: OK (instalación completa + 5 bloques SQL de docs/REPLICA.md probados)"
