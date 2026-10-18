# Manual de réplica · Presente en otra IAP (HU-38)

Cómo poner **Presente** a funcionar para otra institución de Fundación GC1. La app ya es multiorganización:
cada IAP es una **organización** y la base de datos separa sus datos (RLS). Nadie de una IAP puede ver, ni por
error, las checadas, personas o parques de otra. Esto lo prueban automáticamente HU-07 y la API local.

> Todos los bloques SQL de este manual se prueban solos en una base limpia (`supabase/tests/pruebas_replica.sh`).
> Usa siempre **datos reales solo después** de que la IAP firme su aviso de privacidad y su convenio.

---

## 0 · Decidir: ¿mismo proyecto o proyecto propio?

| | **A · Mismo proyecto (recomendado)** | **B · Proyecto propio** |
|---|---|---|
| Qué es | La IAP entra al Supabase y a la dirección de la app que ya usa Parques Alegres | La IAP tiene su propio Supabase y su propia dirección de la app |
| Datos | Separados por organización (RLS), en la misma base | Separados físicamente, en otra base |
| Costo | Un solo plan de Supabase para todas | Un plan por IAP (Pro: respaldo diario) |
| Trabajo | ~1 hora: pasos 1 a 5 | ~1 día: pasos B1 a B6 y luego 1 a 5 |
| Actualizaciones | Llegan a todas al mismo tiempo | Hay que publicarlas en cada proyecto |
| Cuándo | Por omisión | Si la IAP pide su propia cuenta, contrato o lugar de los datos |

**Pendiente con Fundación GC1:** confirmar el modelo por IAP y quién es responsable del tratamiento de datos en cada una.

---

## Opción A · Nueva organización en el mismo proyecto

### Paso 1 · Crear el usuario de la primera persona de administración

En Supabase: **Authentication › Users › Add user › Create new user**.
- Escribe su correo y una contraseña temporal. Marca **Auto Confirm User**.
- Entrégale la contraseña en persona. La app le pedirá cambiarla al entrar.

### Paso 2 · Crear la organización y nombrar a su administración

En **SQL Editor › New query**, pega este bloque. **Cambia solo los valores marcados** y dale **Run**.

```sql
-- Crea la organización (si no existe) y liga a su primera persona de administración
do $$
declare
  -- ▼ Cambia solo estos valores ▼
  v_slug          text := 'iap-ejemplo';             -- identificador corto: minúsculas, números y guiones
  v_nombre        text := 'IAP Ejemplo';             -- nombre visible en la app
  v_zona          text := 'America/Mazatlan';        -- zona horaria de la IAP
  v_correo_admin  text := 'correo@de.la.persona';    -- el usuario del paso 1
  v_nombre_admin  text := 'Nombre Completo';
  -- ▲ ▲
  v_org      uuid;
  v_usuario  uuid;
begin
  select id into v_usuario from auth.users where lower(email) = lower(v_correo_admin);
  if v_usuario is null then
    raise exception 'No existe el usuario %: créalo primero en Authentication › Users', v_correo_admin;
  end if;
  insert into public.organizaciones (slug, nombre, zona_horaria) values (v_slug, v_nombre, v_zona)
    on conflict (slug) do nothing;
  select id into v_org from public.organizaciones where slug = v_slug;
  if not exists (select 1 from public.miembros where organizacion_id = v_org and user_id = v_usuario) then
    insert into public.miembros (organizacion_id, user_id, nombre_completo, rol)
    values (v_org, v_usuario, v_nombre_admin, 'admin');
  end if;
  raise notice 'Organización % lista; administración: %', v_nombre, v_correo_admin;
end $$;
```

Si lo corres dos veces no duplica nada.

### Paso 3 · Ajustar las reglas de la IAP

Cada IAP decide sus reglas. Ninguna está escrita en el código. Cambia los valores que acuerden, el `slug` de la
última línea, y dale **Run**. Lo que no cambies se queda con el valor por omisión.

```sql
-- Reglas de la organización (organizaciones.config). Valores por omisión.
update public.organizaciones
   set config = config || jsonb_build_object(
         'tolerancia_entrada_min',         10,       -- minutos de tolerancia antes de contar retardo
         'tolerancia_geocerca_m',          30,       -- margen extra (m) sobre el perímetro del parque
         'radio_por_defecto_m',            80,       -- radio (m) de los sitios sin perímetro
         'umbral_desfase_min',             10,       -- diferencia de reloj teléfono/servidor que se revisa
         'max_horas_sin_conexion',         72,       -- checadas sin señal más viejas se revisan
         'selfie_obligatoria',             true,     -- selfie al iniciar y terminar bloque
         'selfie_en_pausas_y_visitas',     false,    -- selfie también en pausas y llegadas a parque
         'validar_domicilio',              false,    -- validar la ubicación del teletrabajo contra el domicilio
         'permitir_dias_sin_horario',      true,     -- permitir checar en días sin horario (fines de semana)
         'dias_para_corregir',             30,       -- días hacia atrás para pedir una corrección
         'recordatorio_salida_min',        30,       -- aviso al asesor si olvidó checar salida
         'aviso_sin_checar_min',           30,       -- aviso a coordinación si alguien no ha checado entrada
         'aviso_coord_bloque_abierto_min', 60,       -- aviso a coordinación si un bloque sigue abierto
         'jornada_semanal_horas',          40,       -- horas ordinarias de lunes a viernes
         'horas_medio_dia_libre',          4,        -- horas que vale el medio día libre
         'medio_dia_libre_por',            'semana', -- 'semana' (uno por semana) o 'dia' (uno por día fuera de horario)
         'meta_puntualidad_pct',           90,       -- meta del panel de métricas
         'meta_dentro_zona_pct',           90,       -- meta del panel de métricas
         'dias_entre_respaldos',           31,       -- aviso si no hay respaldo reciente
         'razon_social',                   '',       -- para el encabezado del reporte a la autoridad
         'rfc',                            '',
         'registro_patronal',              '',
         'domicilio',                      ''
       )
 where slug = 'iap-ejemplo';
```

El **color** se cambia desde el panel (Organización › Marca). El **horario tipo** para altas nuevas
(`horario_tipo`) se puede dejar como está: cada horario se ajusta por persona en Personas.

### Paso 4 · Cargar los parques y sitios

Los parques de cada IAP **no van en este repositorio**: el catálogo es información interna y se guarda en el
Drive de la IAP. Se cargan con una tabla temporal:

**4.1** Crea la tabla de carga:

```sql
-- Tabla temporal para importar el catálogo de sitios desde un CSV
create table public.carga_sitios (
  clave              text,               -- clave interna del parque (única)
  nombre             text not null,
  colonia            text,
  tipo               text,               -- parque | oficina | otro (vacío = parque)
  lat                double precision not null,
  lon                double precision not null,
  radio_m            integer,            -- solo si no hay perímetro (vacío = radio por omisión)
  perimetro_geojson  text                -- polígono o multipolígono en GeoJSON (vacío = sin perímetro)
);
alter table public.carga_sitios enable row level security;   -- nadie la lee desde la app
```

**4.2** En **Table Editor › carga_sitios › Insert › Import data from CSV**, sube el CSV del catálogo con esas
columnas. Exporta desde Excel como "CSV UTF-8".

**4.3** Pasa los sitios a la app. Cambia el `slug` de la última línea:

```sql
-- Copia la carga al catálogo de la organización (no duplica: la clave es única por organización)
insert into public.sitios (organizacion_id, clave_externa, nombre, colonia, tipo, centro, perimetro, radio_m)
select o.id, c.clave, c.nombre, nullif(c.colonia, ''), coalesce(nullif(c.tipo, ''), 'parque'),
       extensions.st_setsrid(extensions.st_makepoint(c.lon, c.lat), 4326)::extensions.geography,
       case when nullif(c.perimetro_geojson, '') is null then null
            else extensions.st_multi(extensions.st_setsrid(extensions.st_geomfromgeojson(c.perimetro_geojson), 4326))::extensions.geography end,
       c.radio_m
  from public.carga_sitios c
  join public.organizaciones o on o.slug = 'iap-ejemplo'
on conflict (organizacion_id, clave_externa) do nothing;
```

**4.4** Comprueba y borra la tabla de carga. Es solo un apoyo; el catálogo ya quedó en `sitios`:

```sql
-- Revisión: sitios de la organización, con y sin perímetro
select count(*) as sitios, count(perimetro) as con_perimetro
  from public.sitios where organizacion_id = (select id from public.organizaciones where slug = 'iap-ejemplo');
drop table public.carga_sitios;
```

Los **domicilios** para teletrabajo solo se necesitan si la IAP activa `validar_domicilio`. Por omisión no.

### Paso 5 · Entregar a la IAP

1. La persona de administración entra a la app con su correo, cambia su contraseña y abre **Panel**.
2. En **Organización › Marca** elige su color, si lo desea.
3. En **Personas** da de alta a su equipo: correo, contraseña temporal, rol y horario.
4. Comparte la **guía de instalación con QR** (Personas › "guía de una página con código QR"). La dirección es la
   misma de la app y la guía muestra el nombre de la IAP.
5. Los **avisos con la app cerrada** ya funcionan: el reloj de 5 minutos revisa todas las organizaciones.
6. Recuérdale el **respaldo mensual** (Organización › Respaldos) y la guía `docs/RESPALDOS.md`.

---

## Opción B · Proyecto propio de Supabase

Haz B1 a B6 y luego los pasos 1 a 5 de la opción A **en el proyecto nuevo**.

**B1 · Crear el proyecto.** En supabase.com: **New project**. Región: la más cercana a México (p. ej. `us-west-1`).
Guarda la contraseña de la base en un lugar seguro, fuera de este repositorio.

**B2 · Instalar la base.** En **SQL Editor › New query**, pega todo `supabase/instalacion_completa.sql` y dale **Run**
una sola vez. Es la suma de todas las migraciones, en orden. Crea las tablas, las reglas de seguridad, las vistas
y el espacio privado de selfies.

**B3 · Cerrar el registro libre.** En **Authentication › Sign In / Providers**, desactiva "Allow new users to sign up".
Las cuentas solo las crea administración desde el panel.

**B4 · Publicar las funciones.** Sigue `docs/ALTA_PERSONAS.md` (función `alta-persona`) y `docs/AVISOS.md`
(función `avisos` y el reloj de 5 minutos, **con la dirección del proyecto nuevo**).

**B5 · Publicar la app.**
1. En GitHub, crea una copia del repositorio para la IAP.
2. En `config.js` cambia `SUPABASE_URL` y `SUPABASE_ANON_KEY` por los del proyecto nuevo (Settings › API: "Project URL"
   y la llave **publishable/anon**). **Nunca la llave secreta (`service_role`).**
3. Activa GitHub Pages en la copia (Settings › Pages).

**B6 · Comprobar.** Abre la dirección nueva: debe salir la pantalla de acceso de Presente. Sigue con el paso 1.

**Actualizaciones futuras (opción B):** cada versión nueva se copia a cada repositorio. Si trae migraciones nuevas,
se aplican **solo las nuevas**, en orden. Nunca vuelvas a correr `instalacion_completa.sql` en un proyecto que ya
tiene datos.

---

## Lista de verificación final

- [ ] La persona de administración entra, cambia su contraseña y ve **Panel** con su organización.
- [ ] Un asesor de prueba (usuario ficticio) checa entrada dentro de un parque, con selfie, y aparece en **Hoy**.
- [ ] El mapa del panel muestra los parques de la IAP, y **solo** los suyos.
- [ ] El reporte para la autoridad trae la razón social y el registro patronal.
- [ ] **Probar aviso** llega al teléfono (Perfil › Recordatorio de salida).
- [ ] Se descarga el primer respaldo y su huella coincide con el LEEME.
- [ ] Antes de datos reales: aviso de privacidad y convenio firmados por la IAP.
