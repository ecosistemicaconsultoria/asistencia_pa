# Respaldos y conservación (HU-34)

El registro de jornada es evidencia ante una inspección de la STPS. Hay que poder **mostrarlo completo** y
**demostrar que no se alteró**. La app trabaja en tres capas:

1. **Nada se borra ni se edita.** Las checadas, revisiones, incidencias y la bitácora son de solo inserción.
   La base de datos lo impide, no solo la app. Una corrección es una incidencia aprobada que **agrega** una checada.
2. **Respaldo mensual descargado por Administración.** Es un ZIP con todo el periodo y la huella de cada archivo.
   Se guarda **fuera de Supabase**, por ejemplo en la unidad compartida de la organización.
3. **Copia completa de la base (Supabase).** El plan Pro hace un respaldo diario automático. El plan gratuito no
   tiene respaldos propios: por eso el paso 2 es indispensable mientras sigamos en el plan gratuito.

---

## Una vez · Aplicar la migración 0006

En Supabase, abre **SQL Editor › New query**, pega todo `supabase/migrations/0006_respaldos.sql` y dale **Run**.
Debe decir "Success". La migración crea la tabla `respaldos`, que guarda la constancia de cada respaldo:
quién lo hizo, cuándo, de qué periodo y la huella de cada archivo.

## Cada mes · Descargar el respaldo (Administración)

1. Entra al panel y abre **Respaldos**. El periodo ya viene con el **mes anterior completo**.
2. Toca **Descargar respaldo (ZIP)**. Llega un archivo `respaldo_<organización>_<desde>_<hasta>.zip`.
3. Súbelo a la carpeta de respaldos de la organización, sin abrirlo ni modificarlo.
4. Si pasan más de 31 días sin respaldo, el panel lo avisa en **Requiere atención**. Los días se cambian en
   `organizaciones.config` con `dias_entre_respaldos`.

Contenido del ZIP:

| Archivo | Qué trae |
|---|---|
| `LEEME.txt` | Organización, periodo, quién lo generó, filas y huella SHA-256 de cada archivo, y cómo comprobarlas |
| `checadas.csv` | Todas las checadas: horas (local y UTC), desfase, ubicación, precisión estimada, sitio, zona, revisión, justificación, selfie, origen |
| `revisiones.csv` | Validaciones y observaciones de coordinación |
| `incidencias.csv` | Solicitudes de corrección y su resolución |
| `bitacora.csv` | Auditoría de altas, bajas, cambios de rol y horario, revisiones, incidencias y respaldos |
| `personas.csv` | Personas de la organización (alta y baja) |

Las **selfies no van en el ZIP**, porque son fotos. La columna `selfie` dice dónde están guardadas en Supabase.

## Cómo demostrar que un archivo no cambió

La huella SHA-256 es como una "huella digital" del archivo: si cambia una sola letra, la huella es otra.

- **Windows:** `certutil -hashfile checadas.csv SHA256`
- **Mac o Linux:** `shasum -a 256 checadas.csv`

Compara el resultado con la huella escrita en `LEEME.txt`. La huella del **ZIP completo** queda registrada en
la app (**Panel › Respaldos**, al pasar el cursor sobre la huella corta) y en la bitácora. Así se puede comprobar
que el ZIP guardado es el mismo que se descargó ese día.

## Abrir los CSV

Haz doble clic: Excel los abre con acentos correctos (UTF-8 con BOM). Los textos libres que empiezan con
`=`, `+`, `-` o `@` llevan un apóstrofo al inicio, para que Excel no los ejecute como fórmula.

## Conservación

- La app **no borra nunca** registros de jornada, ni siquiera de personas dadas de baja.
- **Pendiente con el área jurídica de Parques Alegres:** confirmar el plazo mínimo de conservación que aplica
  (Ley Federal del Trabajo y su reglamento). Mientras tanto, la recomendación es conservar todo.
- **Antes del 1 de enero de 2027:** pasar el proyecto de Supabase al plan Pro, que incluye el respaldo diario.

## Si algún día hay que recuperar

- **Consultar un periodo pasado:** basta con el ZIP del mes.
- **Recuperar la base completa** (por ejemplo, si se perdiera el proyecto): con el plan Pro, Supabase restaura su
  respaldo diario desde Database › Backups. Con el plan gratuito, la información está en los ZIP mensuales;
  volver a cargarlos a una base nueva lo haría Ecosistémica.
