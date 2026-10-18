// Respaldo de la organización por periodo (HU-34). Módulo puro salvo la huella (WebCrypto).
// Arma un ZIP con un CSV por tabla (checadas, revisiones, incidencias, bitácora, personas) y un LEEME.txt con el
// número de filas y la huella SHA-256 de cada archivo, para demostrar después que nada se alteró.
// Los datos son una copia fiel; la única transformación: los textos libres que empiezan con = + - @ llevan un
// apóstrofo al inicio para que Excel no los ejecute como fórmula (se explica en el LEEME).
import { armarZip } from './zip.js';

const FORMULA = /^[=+\-@]/;
function celda(v, { libre = false } = {}) {
  let t = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (libre && FORMULA.test(t)) t = `'${t}`;
  return /[",\n\r;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
// columnas: [[encabezado, (fila) => valor, { libre }?]]
export function csv(filas, columnas) {
  const lineas = [columnas.map(([c]) => c).join(',')];
  for (const f of filas) lineas.push(columnas.map(([, valor, op]) => celda(valor(f), op)).join(','));
  return `﻿${lineas.join('\r\n')}\r\n`;
}

const local = (iso, zona) => (iso ? new Intl.DateTimeFormat('sv-SE', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(iso)) : '');
const LIBRE = { libre: true };

// datos: { personas, eventos, revisiones, incidencias, bitacora, sitios } tal como vienen de Supabase.
// Devuelve [{ nombre, texto, filas }] (sin huellas todavía).
export function archivosDelRespaldo(datos, { zona = 'America/Mazatlan' } = {}) {
  const persona = new Map(datos.personas.map((p) => [p.id, p]));
  const nombre = (id) => persona.get(id)?.nombre_completo || '';
  const empleado = (id) => persona.get(id)?.num_empleado || '';
  const sitio = new Map((datos.sitios || []).map((s) => [s.id, s]));
  return [
    { nombre: 'checadas.csv', filas: datos.eventos.length, texto: csv(datos.eventos, [
      ['id', (e) => e.id], ['num_empleado', (e) => empleado(e.miembro_id)], ['persona', (e) => nombre(e.miembro_id)], ['miembro_id', (e) => e.miembro_id],
      ['tipo', (e) => e.tipo], ['bloque', (e) => e.bloque], ['modalidad', (e) => e.modalidad],
      ['hora_efectiva_local', (e) => local(e.hora_efectiva, zona)], ['hora_efectiva_utc', (e) => e.hora_efectiva],
      ['hora_servidor_utc', (e) => e.hora_servidor], ['hora_dispositivo_utc', (e) => e.hora_dispositivo], ['desfase_seg', (e) => e.desfase_seg],
      ['capturado_sin_conexion', (e) => (e.capturado_sin_conexion ? 'si' : 'no')],
      ['lat', (e) => e.lat], ['lon', (e) => e.lon], ['precision_estimada_m', (e) => e.precision_m],
      ['sitio_clave', (e) => sitio.get(e.sitio_id)?.clave || ''], ['sitio', (e) => sitio.get(e.sitio_id)?.nombre || ''], ['sitio_id', (e) => e.sitio_id],
      ['distancia_sitio_m', (e) => e.distancia_sitio_m], ['dentro_geocerca', (e) => (e.dentro_geocerca === null || e.dentro_geocerca === undefined ? '' : e.dentro_geocerca ? 'si' : 'no')],
      ['estado_revision', (e) => e.estado_revision], ['motivos_revision', (e) => (e.motivos_revision || []).join(' ')],
      ['justificacion', (e) => e.justificacion, LIBRE], ['selfie', (e) => e.selfie_path], ['origen', (e) => e.origen], ['incidencia_id', (e) => e.incidencia_id],
      ['version_app', (e) => e.version_app]
    ]) },
    { nombre: 'revisiones.csv', filas: datos.revisiones.length, texto: csv(datos.revisiones, [
      ['id', (r) => r.id], ['checada_id', (r) => r.evento_id], ['decision', (r) => r.decision], ['comentario', (r) => r.comentario, LIBRE],
      ['revisado_por', (r) => nombre(r.revisado_por)], ['revisado_en_local', (r) => local(r.revisado_en, zona)], ['revisado_en_utc', (r) => r.revisado_en]
    ]) },
    { nombre: 'incidencias.csv', filas: datos.incidencias.length, texto: csv(datos.incidencias, [
      ['id', (i) => i.id], ['num_empleado', (i) => empleado(i.miembro_id)], ['persona', (i) => nombre(i.miembro_id)], ['tipo', (i) => i.tipo],
      ['checada_original_id', (i) => i.evento_original_id], ['checada_propuesta', (i) => [i.tipo_evento_propuesto, i.bloque_propuesto].filter(Boolean).join(' ')],
      ['hora_propuesta_local', (i) => local(i.hora_propuesta, zona)], ['motivo', (i) => i.motivo, LIBRE], ['estado', (i) => i.estado],
      ['resuelta_por', (i) => nombre(i.resuelta_por)], ['resuelta_en_local', (i) => local(i.resuelta_en, zona)], ['comentario_resolucion', (i) => i.comentario_resolucion, LIBRE],
      ['creada_en_local', (i) => local(i.creada_en, zona)], ['creada_en_utc', (i) => i.creada_en]
    ]) },
    { nombre: 'bitacora.csv', filas: datos.bitacora.length, texto: csv(datos.bitacora, [
      ['id', (b) => b.id], ['en_local', (b) => local(b.en, zona)], ['en_utc', (b) => b.en], ['tabla', (b) => b.tabla], ['registro_id', (b) => b.registro_id],
      ['accion', (b) => b.accion], ['actor', (b) => b.actor], ['datos', (b) => b.datos, LIBRE]
    ]) },
    { nombre: 'personas.csv', filas: datos.personas.length, texto: csv(datos.personas, [
      ['miembro_id', (p) => p.id], ['num_empleado', (p) => p.num_empleado], ['nombre', (p) => p.nombre_completo, LIBRE], ['rol', (p) => p.rol],
      ['activo', (p) => (p.activo ? 'si' : 'no')], ['fecha_alta', (p) => p.fecha_alta], ['fecha_baja', (p) => p.fecha_baja]
    ]) }
  ];
}

export function leeme({ organizacion, desde, hasta, generado, por, archivos }) {
  return [
    'RESPALDO DEL REGISTRO DE JORNADA · Presente',
    `Organización: ${organizacion}`,
    `Periodo: ${desde} a ${hasta} (fechas de la zona horaria de la organización)`,
    `Generado: ${generado}`,
    `Por: ${por}`,
    '',
    'ARCHIVOS (filas · huella SHA-256)',
    ...archivos.map((a) => `${a.nombre} · ${a.filas} filas · ${a.sha256}`),
    '',
    'CÓMO COMPROBAR QUE UN ARCHIVO NO CAMBIÓ',
    'Calcula su huella SHA-256 y compárala con la de arriba. Si coincide, el archivo es idéntico al respaldado.',
    '  Windows:     certutil -hashfile checadas.csv SHA256',
    '  Mac o Linux: shasum -a 256 checadas.csv',
    'La huella del ZIP completo quedó registrada en la app (Panel › Respaldos) y en su bitácora.',
    '',
    'NOTAS',
    '· Las checadas nunca se editan ni se borran: las correcciones son incidencias aprobadas que agregan una checada nueva (origen = incidencia).',
    '· Las horas en *_local están en la zona horaria de la organización; las *_utc, en tiempo universal.',
    '· Las selfies no van en el ZIP (son fotos): la columna "selfie" indica dónde están guardadas en Supabase.',
    '· Los textos libres que empiezan con = + - @ llevan un apóstrofo al inicio para que Excel no los tome como fórmula.',
    '· CSV en UTF-8 con BOM: Excel muestra bien los acentos.',
    ''
  ].join('\r\n');
}

export async function sha256(bytes) {
  const h = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Arma el ZIP completo. Devuelve { zip: Uint8Array, archivos: [{ nombre, filas, sha256 }], sha256Zip }
export async function armarRespaldo(datos, { organizacion, desde, hasta, por, zona, ahora = new Date() }) {
  const enc = new TextEncoder();
  const piezas = archivosDelRespaldo(datos, { zona });
  const archivos = [];
  const contenido = [];
  for (const p of piezas) {
    const bytes = enc.encode(p.texto);
    archivos.push({ nombre: p.nombre, filas: p.filas, sha256: await sha256(bytes) });
    contenido.push({ nombre: p.nombre, bytes });
  }
  const generado = local(ahora.toISOString(), zona);
  contenido.unshift({ nombre: 'LEEME.txt', bytes: enc.encode(leeme({ organizacion, desde, hasta, generado, por, archivos })) });
  const zip = armarZip(contenido, ahora);
  return { zip, archivos, sha256Zip: await sha256(zip) };
}
