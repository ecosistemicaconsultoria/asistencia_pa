# Backlog técnico — App de Asistencia

Derivado del product backlog (38 historias). Aquí solo está lo que construye la sesión de código, en orden.
Los IDs `HU-xx` coinciden con el backlog maestro. Estado al 2-oct-2026: **HU-06 (modelo de datos) hecho** en
`supabase/migrations/0001_esquema_inicial.sql`, con pruebas en `supabase/tests/`.

Migraciones: `0001` y `0002` aplicadas; **`0003_incidencias.sql` (v17) y `0004_revisiones.sql` (v19) deben aplicarse en el SQL Editor de Supabase, en ese orden** (0003: validaciones de incidencias y la hora corregida reemplaza a la original en `v_jornada_diaria`; 0004: tabla `revisiones` para validar u observar checadas sin modificarlas).
(0002: pausas sin revisión de zona por decisión del PO del 3-oct-2026; teletrabajo validado contra el domicilio propio).

Función de Supabase: **`alta-persona` (v24) debe publicarse una vez** (pasos en `docs/ALTA_PERSONAS.md`, al final).

Leyenda: ☐ pendiente · ◐ en curso · ☑ terminado (al cerrar, poner la versión `vNN`)

---

## Sprint 1 · Plataforma y checada en línea (adelantado: arranca en cuanto exista el proyecto Supabase)

**Objetivo:** un asesor de prueba inicia sesión, ve su jornada del día y registra inicio y fin de bloque con GPS y geocerca, en línea.

| Estado | ID | Historia | Criterios de aceptación |
|---|---|---|---|
| ☑ v01 | T-01 | Esqueleto PWA | `index.html`, `manifest.json`, `sw.js` (`asis-AAAA-MM-DD-v01`), `css/app.css` con tokens, fuentes IBM Plex locales, íconos. Instalable en Android; Lighthouse PWA sin errores |
| ☑ v02 | HU-08 | Inicio de sesión | Correo + contraseña; sesión persistente; si el usuario no tiene fila activa en `miembros`, mensaje claro y cierre de sesión; selector si pertenece a 2 organizaciones |
| ☑ v03 | HU-07 | Verificar separación | Prueba Playwright o SQL que confirme que un usuario de `iap-demo` no ve datos de `parques-alegres` (ya cubierto en SQL; agregar prueba e2e mínima) |
| ☑ v04 | HU-10 | Sitios en caché | Descarga `v_sitios_app` al iniciar sesión y una vez al día; guarda en IndexedDB; búsqueda por nombre o clave; funciona sin señal |
| ☑ v05 | HU-12 | Botón principal y estado del día | `js/reglas.js` implementa la tabla de estados de `docs/ESPECIFICACION.md` §2 con pruebas unitarias (casos: día normal, olvido de fin, pausa abierta, sin horario) |
| ☑ v06 | HU-17 | Checada con GPS y geocerca | Flujo §3 pasos 1–3 y 5 (sin selfie aún); punto en polígono en cliente; justificación obligatoria fuera de zona en bloque de campo; el evento llega a Supabase y el servidor coincide con el cálculo del cliente en 3 casos de prueba |
| ☑ v07 | HU-09a | Alta manual documentada | `docs/ALTA_PERSONAS.md`: pasos en el panel de Supabase para crear usuario + fila en `miembros` + horario |

**Demo de Sprint Review:** en un celular real, checar entrada y salida dentro de un parque del catálogo y ver los eventos en Supabase con `dentro_geocerca = true`.

## Sprint 2 · Verificación completa y modo sin señal

| Estado | ID | Historia | Criterios de aceptación |
|---|---|---|---|
| ☑ v08 | HU-18 | Selfie | §6; ≤ 60 KB; sube a `selfies/{org}/{miembro}/{yyyy}/{mm}/{id}.webp`; respaldo con input de archivo; cámara se apaga al terminar |
| ☑ v09 | HU-22 | Cola offline | §5 completo; prueba Playwright: checar sin conexión, recargar la app, volver a tener conexión y ver el evento en el servidor con `capturado_sin_conexion = true` y `hora_efectiva = hora_dispositivo` |
| ☑ v10 | HU-19 | Hora doble | Indicador al usuario si el reloj del teléfono difiere > 10 min de la hora del servidor (obtenida al iniciar sesión) |
| ☑ v11 | HU-13 | Pausas | Inicio/fin de comida; cierre automático confirmado al terminar bloque |
| ☑ v12 | HU-20 | Bloque de escritorio en teletrabajo | Modalidad desde `horarios`; sin validación de zona mientras `validar_domicilio = false` |
| ☑ v13 | HU-33 | Inalterabilidad verificada | Prueba e2e: intentar `update`/`delete` con la llave pública falla; la interfaz no ofrece editar ni borrar |
| ☑ v14 | HU-14 | Mis horas | Horas del día y de la semana desde `v_jornada_diaria` + eventos locales no enviados |

## Sprint 3 · Visitas, panel e incidencias

Decisiones del PO (4-oct-2026, sujetas a revisión con Parques Alegres): PDF con página de impresión del navegador
(sin dependencias nuevas) + CSV para nómina; HU-15 = aviso en la app y notificación con la app abierta (Web Push con
la app cerrada → Sprint 4); sábados libres y configurables (`permitir_dias_sin_horario = true`); si el tiempo aprieta,
HU-15 pasa al Sprint 4.

| Estado | ID | Historia | Criterios de aceptación |
|---|---|---|---|
| ☑ v15 | HU-12b | Jornada de lunes a viernes y sábados ocasionales | Día sin horario = "actividad fuera de horario" (elige tipo al checar; al cerrarla, jornada cerrada con opción de otra); sin alerta de olvido ni retardo; "Fuera de horario" en Mis horas; `permitir_dias_sin_horario` configurable |
| ☑ v16 | HU-24 | Visitas a parques | Llegada/salida por parque; llegar a otro parque cierra el anterior; pantalla Visitas §7.3 |
| ☑ v18 | HU-27 | Panel de coordinación | `panel.html` §8 (tarjetas + tabla del día) solo para `coordinador`/`admin` |
| ☑ v17 | HU-28/29 | Incidencias | Asesor solicita con motivo (≥ 5 caracteres); coordinación aprueba/rechaza; el evento corregido aparece con `origen = 'incidencia'` |
| ☑ v19 | HU-23 | Bandeja de revisión | Lista de eventos `revisar` con motivos y selfie (URL firmada) |
| ☑ v20 | HU-31 | Reporte para autoridad | PDF por periodo y persona: datos de la organización, persona, cada día con inicio, fin, bloques, pausas, minutos efectivos y marcas de revisión/incidencia |
| ☑ v21 | HU-16 | Mi registro | El asesor consulta y descarga su historial (CSV y PDF) |
| ☑ v22 | HU-15 | Recordatorio de salida | Notificación local si el bloque sigue abierto 30 min después del fin programado |

## Sprint 4 · Listo para el piloto

**Objetivo:** coordinación da de alta a sus asesores sin ayuda técnica, la app se instala con QR, los avisos llegan con la
app cerrada y el CSV separa horas ordinarias y extra. Plan y decisiones a validar: documento de la Sprint Review 3 (fuera del repo).

| Estado | ID | Historia | Criterios de aceptación |
|---|---|---|---|
| ◐ v23 | T-02 | Ajustes de la Review y prueba en Supabase real | Hecho (v23): panel cómodo en el celular (menú fijo con pendientes, incidencias antes de reportes, acceso desde Inicio). Falta: decisiones marcadas "Cambiar" y el guion de la demo en Android e iPhone reales |
| ☑ v24 | HU-09 | Alta de personas y horarios desde el panel | Admin crea cuenta, liga a la organización, asigna rol y horario, da de baja sin borrar; la llave secreta solo vive en Supabase |
| ☑ v27 | HU-35 | Instalación con QR y guía de una página | QR que abre la app; guía para Android y iPhone (pantalla de inicio, permisos de ubicación, cámara y notificaciones) |
| ☑ v28 | HU-32 | Horas ordinarias y extra por semana | CSV semanal por persona; jornada semanal y reglas de pago configurables. Regla del PO (oct-2026): 40 h de lunes a viernes; la actividad fuera de horario no se paga como extra, da medio día libre la semana siguiente (`jornada_semanal_horas`, `horas_medio_dia_libre`, `medio_dia_libre_por`) |
| ☑ v29 | HU-15b | Recordatorio con la app cerrada (Web Push) | Llega con la app cerrada (Android; iPhone con la app instalada); una vez por bloque y día |
| ☑ v29 | HU-30 | Alertas a coordinación | "Sin checar" y bloques sin cerrar, en el panel y por notificación; horarios configurables |
| ☑ v30 | UX-01 | Revisión de usabilidad (UI/UX) | Checada: estado de ubicación arriba, detalles plegables y confirmar fijo abajo con el motivo si aún no se puede; acciones delicadas (baja, cerrar sesión, rechazar) en contorno y la baja dentro de Editar; misma acción, mismo color; días futuros con contraste AA; efecto al tocar y respeto a «reducir movimiento»; íconos SVG (sin emojis); ayudas del panel plegadas |
| ☑ v31 | UX-02 | Nombre y logotipo propios: «Presente» | Ícono neutral (pin con palomita, logotipo B elegido por el PO) con los colores de la marca; nombre «Presente» con el subtítulo «Registro de jornada» en acceso, instalación, panel y guía con QR. Pendiente: revisar el nombre en Marcanet (IMPI, clase 9) antes de registrarlo |

## Sprint 5 · Panel de personal visual

**Decisiones del PO (oct-2026):** se conserva la paleta de Ecosistémica y se adoptan los patrones de tablero que propone
la guía UI/UX Pro Max; altas, bajas y revisiones siguen en el rol Administración; Dirección es la revisora final de todas
las personas (incluida quien administra); el punto de ubicación NO se arrastra (es la evidencia): solo mapa con polígonos.

| Estado | ID | Historia | Criterios de aceptación |
|---|---|---|---|
| ☑ v32 | HU-39 | Métricas de la semana en el panel | Indicadores con estado frente a la meta (puntualidad, horas de la vista oficial, dentro de zona, pendientes); asistencia por día, horas por persona contra la jornada semanal y dentro de zona en 8 semanas; lista "Requiere atención"; cada gráfica con leyenda, descripción por marca y tabla. Metas configurables: `meta_puntualidad_pct` (90), `meta_dentro_zona_pct` (90) |
| ☑ v33 | HU-25 | Mapa con polígonos (Leaflet) | En el panel, los parques con su perímetro (o radio) sobre OpenStreetMap y las checadas del día dentro/fuera de zona con su precisión estimada, ventana de detalle y tabla. El punto no se mueve (es la evidencia). Sin teletrabajo ni domicilios (privacidad). Sin conexión el asesor conserva el mapa esquemático |
| ☑ v35 | HU-34 | Respaldos y conservación | Administración descarga un ZIP del periodo (checadas, revisiones, incidencias, bitácora, personas) con LEEME y huella SHA-256 por archivo; constancia inalterable en `respaldos` (migración 0006); aviso si pasan más de `dias_entre_respaldos` (31) sin respaldo; guía en `docs/RESPALDOS.md`. Pendiente con jurídico de PA: plazo de conservación. Antes de 2027: plan Pro (respaldo diario) |
| ☑ v36 | HU-11 | Marca por organización | Administración elige el color principal en Panel › Organización › Marca, con vista previa; solo se guarda si se lee bien (contraste AA 4.5:1 con texto blanco y sobre el fondo); se aplica en la app, el panel, el reporte y la barra del teléfono; la pantalla de acceso conserva el de omisión. Función del servidor `cambiar_marca` (migración 0007): solo administración, solo cambia `config.color_primario`, queda en la bitácora |
| ☐ | — | Pendiente de Parques Alegres | Cómo opera "Dirección como revisora final": por ahora, Dirección con cuenta de Coordinación revisa a todos (nadie revisa lo propio). Si se quiere doble revisión (Administración y luego Dirección), es una historia nueva |

## Sprint 6 en adelante (referencia)

HU-25 mapa de visitas (Leaflet, solo panel) · HU-30 alertas · HU-32 horas ordinarias/extras para nómina · HU-34 respaldos y conservación ·
HU-36 piloto con 5 asesores · HU-11 marca por organización · HU-38 manual de réplica para otras IAP.
