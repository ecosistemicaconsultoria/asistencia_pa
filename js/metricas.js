// Métricas de la semana para el panel (HU-39). Módulo puro: recibe datos y devuelve números; no toca la pantalla.
// Usa las mismas reglas que la app y el tablero (js/reglas.js). Las horas salen de la vista oficial v_jornada_diaria
// (la misma de nómina y reportes): solo bloques cerrados.
//
// Metas configurables por organización (organizaciones.config):
//   meta_puntualidad_pct (90) · meta_dentro_zona_pct (90) · jornada_semanal_horas (40) · tolerancia_entrada_min (10)
import { partesLocales, horarioDelDia, instanteLocal, diasDeLaSemana } from './reglas.js';

export const METAS = { meta_puntualidad_pct: 90, meta_dentro_zona_pct: 90, jornada_semanal_horas: 40, tolerancia_entrada_min: 10 };
const aMinutos = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const sumarDias = (fecha, n) => { const d = new Date(`${fecha}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Estado de un indicador frente a su meta: 'ok' (≥ meta), 'av' (hasta 10 puntos abajo), 'cr' (más abajo); null sin datos.
export function semaforo(valor, meta) {
  if (valor === null || valor === undefined) return null;
  return valor >= meta ? 'ok' : valor >= meta - 10 ? 'av' : 'cr';
}

// Entrada de una persona en un día: 'a_tiempo' | 'retardo' | 'sin_checar' | null (aún no le toca o no tiene horario).
// Se califica por la entrada de cada bloque ya iniciado; el día toma el peor resultado (sin checar > retardo > a tiempo).
function entradaDelDia({ horario, eventos, esHoy, minutosAhora, zona, tolerancia }) {
  let resultado = null;
  const PESO = { a_tiempo: 0, retardo: 1, sin_checar: 2 };
  for (const h of horario) {
    const limite = aMinutos(h.inicio) + tolerancia;
    if (esHoy && minutosAhora <= limite) continue;   // todavía está a tiempo de checar
    const inicio = eventos.filter((e) => e.tipo === 'inicio_bloque' && e.bloque === h.bloque)
      .sort((a, b) => new Date(a.hora_efectiva) - new Date(b.hora_efectiva))[0];
    const r = !inicio ? 'sin_checar' : partesLocales(inicio.hora_efectiva, zona).minutos > limite ? 'retardo' : 'a_tiempo';
    if (resultado === null || PESO[r] > PESO[resultado]) resultado = r;
  }
  return resultado;
}

// miembros: activos [{ id, nombre_completo }]; horarios: filas de `horarios`; eventos: de las últimas 8 semanas;
// corregidas: Set de ids reemplazados por incidencia; jornada: filas de v_jornada_diaria de esta semana.
export function metricasSemana({ miembros, horarios, eventos, corregidas = new Set(), jornada = [], ahora = new Date(), zona = 'America/Mazatlan', config = {} }) {
  const c = { ...METAS, ...config };
  const tolerancia = Number(c.tolerancia_entrada_min);
  const { fecha: hoy, minutos: minutosAhora } = partesLocales(ahora, zona);
  const semana = diasDeLaSemana(ahora, zona);
  const vigentes = eventos.filter((e) => !corregidas.has(e.id));
  const delDia = new Map();
  for (const e of vigentes) {
    const clave = `${e.miembro_id}|${partesLocales(e.hora_efectiva, zona).fecha}`;
    if (!delDia.has(clave)) delDia.set(clave, []);
    delDia.get(clave).push(e);
  }
  const horarioDe = (m, fecha) => horarioDelDia(horarios.filter((h) => h.miembro_id === m.id), instanteLocal(fecha, '12:00', zona), zona);

  // 1) Asistencia por día (lunes → hoy). Se muestran los días con alguien programado (fines de semana solo si hay horario).
  const dias = [];
  for (const fecha of semana) {
    if (fecha > hoy) break;
    const d = { fecha, aTiempo: 0, retardo: 0, sinChecar: 0, programadas: 0 };
    for (const m of miembros) {
      const horario = horarioDe(m, fecha);
      if (!horario.length) continue;
      d.programadas++;
      const r = entradaDelDia({ horario, eventos: delDia.get(`${m.id}|${fecha}`) || [], esHoy: fecha === hoy, minutosAhora, zona, tolerancia });
      if (r === 'a_tiempo') d.aTiempo++;
      else if (r === 'retardo') d.retardo++;
      else if (r === 'sin_checar') d.sinChecar++;
    }
    if (d.programadas) dias.push(d);
  }
  const calificadas = dias.reduce((s, d) => s + d.aTiempo + d.retardo + d.sinChecar, 0);
  const puntualidad = pct(dias.reduce((s, d) => s + d.aTiempo, 0), calificadas);

  // 2) Horas de la semana por persona (vista oficial), solo personas con horario esta semana
  const minutosPorPersona = new Map();
  for (const f of jornada) {
    if (f.fecha < semana[0] || f.fecha > semana[6]) continue;
    minutosPorPersona.set(f.miembro_id, (minutosPorPersona.get(f.miembro_id) || 0) + (Number(f.minutos_efectivos) || 0));
  }
  const conHorario = miembros.filter((m) => semana.some((f) => horarioDe(m, f).length));
  const horas = conHorario.map((m) => ({ miembroId: m.id, nombre: m.nombre_completo, minutos: minutosPorPersona.get(m.id) || 0 }))
    .sort((a, b) => b.minutos - a.minutos || a.nombre.localeCompare(b.nombre, 'es'));
  const metaMinutos = Number(c.jornada_semanal_horas) * 60;

  // 3) Checadas dentro de zona por semana (8 semanas, la última es la actual). Solo checadas con zona revisada.
  const semanas = [];
  for (let i = 7; i >= 0; i--) {
    const lunes = sumarDias(semana[0], -7 * i);
    const domingo = sumarDias(lunes, 6);
    const conZona = vigentes.filter((e) => {
      if (e.dentro_geocerca !== true && e.dentro_geocerca !== false) return false;
      const f = partesLocales(e.hora_efectiva, zona).fecha;
      return f >= lunes && f <= domingo;
    });
    semanas.push({ lunes, checadas: conZona.length, dentro: conZona.filter((e) => e.dentro_geocerca).length, pct: pct(conZona.filter((e) => e.dentro_geocerca).length, conZona.length) });
  }
  const zonaSemana = semanas[semanas.length - 1];

  return {
    dias, puntualidad, calificadas,
    horas, metaMinutos, minutosSemana: horas.reduce((s, h) => s + h.minutos, 0),
    semanas, dentroDeZona: zonaSemana.pct, checadasConZona: zonaSemana.checadas,
    metas: { puntualidad: Number(c.meta_puntualidad_pct), dentroDeZona: Number(c.meta_dentro_zona_pct) }
  };
}
