// HU-39 · Métricas de la semana en el panel: puntualidad, horas (vista oficial), dentro de zona en 8 semanas,
// pendientes y "Requiere atención"; gráficas SVG con leyenda, descripciones y tabla de datos. Datos ficticios.
// Reloj: jueves 8-oct-2026 (Culiacán).
import { test, expect } from '@playwright/test';
import { simularSupabase, entrar, eventoServidor as ev, HORARIO_ASESOR, USUARIOS } from './simulador.js';
import { metricasSemana, semaforo } from '../js/metricas.js';

const ZONA = 'America/Mazatlan';
const JUEVES = new Date('2026-10-08T10:00:00-07:00');
const horario = (m) => HORARIO_ASESOR.map((h) => ({ ...h, miembro_id: m }));
const e = (m, tipo, hora, extra = {}) => ({ ...ev(tipo, hora, extra), miembro_id: m });

test('lógica: entradas a tiempo, con retardo y sin checar; el día toma el peor bloque; hoy solo cuenta lo ya iniciado', () => {
  const miembros = [{ id: 'ana', nombre_completo: 'Ana Ficticia' }, { id: 'beto', nombre_completo: 'Beto Ficticio' }, { id: 'admin', nombre_completo: 'Admin Ficticia' }];
  const eventos = [
    e('ana', 'inicio_bloque', '2026-10-05T09:02', { bloque: 'escritorio' }), e('ana', 'inicio_bloque', '2026-10-05T16:05', { bloque: 'campo' }),   // lun: a tiempo
    e('ana', 'inicio_bloque', '2026-10-06T09:25', { bloque: 'escritorio' }), e('ana', 'inicio_bloque', '2026-10-06T16:00', { bloque: 'campo' }),   // mar: retardo
    e('ana', 'inicio_bloque', '2026-10-07T09:00', { bloque: 'escritorio' }),                                                                     // mié: no entró a campo → sin checar
    e('ana', 'inicio_bloque', '2026-10-08T09:05', { bloque: 'escritorio' }),                                                                     // jue: a tiempo (campo aún no)
    e('beto', 'inicio_bloque', '2026-10-05T09:00', { bloque: 'escritorio' }), e('beto', 'inicio_bloque', '2026-10-05T16:00', { bloque: 'campo' })
  ];
  const m = metricasSemana({ miembros, horarios: [...horario('ana'), ...horario('beto')], eventos, ahora: JUEVES, zona: ZONA });
  expect(m.dias.map((d) => [d.fecha, d.aTiempo, d.retardo, d.sinChecar, d.programadas])).toEqual([
    ['2026-10-05', 2, 0, 0, 2], ['2026-10-06', 0, 1, 1, 2], ['2026-10-07', 0, 0, 2, 2], ['2026-10-08', 1, 0, 1, 2]
  ]);
  expect(m.puntualidad).toBe(38);   // 3 de 8
  expect(m.horas.map((h) => h.nombre)).toEqual(['Ana Ficticia', 'Beto Ficticio']);   // administración sin horario no aparece
  // Las 09:05 aún están dentro de la tolerancia: hoy nadie cuenta todavía como "sin checar"
  const temprano = metricasSemana({ miembros, horarios: horario('ana'), eventos: [], ahora: new Date('2026-10-08T09:05:00-07:00'), zona: ZONA });
  expect(temprano.dias.at(-1)).toMatchObject({ fecha: '2026-10-08', aTiempo: 0, retardo: 0, sinChecar: 0, programadas: 1 });
  // Tolerancia configurable: con 30 min el martes ya no es retardo
  const tolerante = metricasSemana({ miembros, horarios: horario('ana'), eventos, ahora: JUEVES, zona: ZONA, config: { tolerancia_entrada_min: 30 } });
  expect(tolerante.dias[1]).toMatchObject({ aTiempo: 1, retardo: 0 });
});

test('lógica: horas de la vista oficial, zona por semana (sin inventar semanas vacías), checadas corregidas no cuentan y semáforo', () => {
  const miembros = [{ id: 'ana', nombre_completo: 'Ana Ficticia' }];
  const eventos = [
    e('ana', 'inicio_bloque', '2026-10-05T16:00', { bloque: 'campo', dentro_geocerca: true }),
    e('ana', 'fin_bloque', '2026-10-05T20:00', { bloque: 'campo', dentro_geocerca: false }),
    e('ana', 'inicio_bloque', '2026-10-06T16:00', { bloque: 'campo', dentro_geocerca: false, id: 'corregida' }),
    e('ana', 'inicio_bloque', '2026-09-28T16:00', { bloque: 'campo', dentro_geocerca: true }),
    e('ana', 'inicio_bloque', '2026-09-28T09:00', { bloque: 'escritorio', dentro_geocerca: null })
  ];
  const jornada = [{ miembro_id: 'ana', fecha: '2026-10-05', minutos_efectivos: 480 }, { miembro_id: 'ana', fecha: '2026-10-06', minutos_efectivos: 230 },
    { miembro_id: 'ana', fecha: '2026-09-30', minutos_efectivos: 999 }];   // semana pasada: no cuenta
  const m = metricasSemana({ miembros, horarios: horario('ana'), eventos, corregidas: new Set(['corregida']), jornada, ahora: JUEVES, zona: ZONA, config: { jornada_semanal_horas: 48 } });
  expect(m.horas).toEqual([{ miembroId: 'ana', nombre: 'Ana Ficticia', minutos: 710 }]);
  expect(m.metaMinutos).toBe(48 * 60);
  expect(m.semanas).toHaveLength(8);
  expect(m.semanas.slice(-2).map((s) => [s.lunes, s.dentro, s.checadas, s.pct])).toEqual([['2026-09-28', 1, 1, 100], ['2026-10-05', 1, 2, 50]]);
  expect(m.semanas[0]).toMatchObject({ lunes: '2026-08-17', checadas: 0, pct: null });
  expect([m.dentroDeZona, m.checadasConZona]).toEqual([50, 2]);
  expect([semaforo(95, 90), semaforo(85, 90), semaforo(79, 90), semaforo(null, 90)]).toEqual(['ok', 'av', 'cr', null]);
});

// Asesor de prueba: lun a tiempo, mar con retardo, mié sin checar, jue (hoy) a tiempo; una checada fuera de zona
const EVENTOS = [
  ev('inicio_bloque', '2026-10-05T09:02', { bloque: 'escritorio', modalidad: 'teletrabajo', dentro_geocerca: null }), ev('fin_bloque', '2026-10-05T13:00', { bloque: 'escritorio', modalidad: 'teletrabajo', dentro_geocerca: null }),
  ev('inicio_bloque', '2026-10-05T16:00', { bloque: 'campo' }), ev('fin_bloque', '2026-10-05T20:00', { bloque: 'campo', dentro_geocerca: false }),
  ev('inicio_bloque', '2026-10-06T09:30', { bloque: 'escritorio', modalidad: 'teletrabajo', dentro_geocerca: null }), ev('fin_bloque', '2026-10-06T13:00', { bloque: 'escritorio', modalidad: 'teletrabajo', dentro_geocerca: null }),
  ev('inicio_bloque', '2026-10-06T16:00', { bloque: 'campo' }), ev('fin_bloque', '2026-10-06T20:00', { bloque: 'campo' }),
  ev('inicio_bloque', '2026-10-08T09:01', { bloque: 'escritorio', modalidad: 'teletrabajo', dentro_geocerca: null })
];

async function abrirPanel(page, { ancho = 1280 } = {}) {
  await page.setViewportSize({ width: ancho, height: 900 });
  await page.clock.setFixedTime(JUEVES);
  const sim = await simularSupabase(page, { sitiosPA: 5, eventos: EVENTOS.map((x) => ({ ...x })) });
  await page.goto('index.html');
  await entrar(page, USUARIOS.coordinador);
  await expect(page.locator('#pantalla-app')).toBeVisible();
  await page.goto('panel.html');
  await expect(page.locator('#metricas-estado')).toContainText('Actualizado');
  return sim;
}

test('panel: indicadores con estado, tres gráficas con leyenda y tabla, y lista de atención', async ({ page }) => {
  await abrirPanel(page);
  await expect(page.locator('#metricas-semana')).toHaveText('semana del 5 oct al 11 oct');
  // Puntualidad: lun y jue a tiempo, mar retardo, mié sin checar → 2 de 4 = 50 % (meta 90 %: urgente)
  await expect(page.locator('#kpi-puntualidad')).toHaveText('50 %');
  await expect(page.locator('#kpi-puntualidad-estado')).toHaveText('Urgente');
  await expect(page.locator('#kpi-puntualidad-estado')).toHaveClass(/chip--critico/);
  // Horas (bloques cerrados): lun 7:58 h (09:02–13:00 y 16:00–20:00) + mar 7:30 h
  await expect(page.locator('#kpi-horas')).toHaveText('15:28');
  await expect(page.locator('#kpi-horas-meta')).toHaveText(' / 40 h');
  // Zona: 4 checadas de campo con zona, 3 dentro → 75 % (meta 90 %: más de 10 puntos abajo, urgente)
  await expect(page.locator('#kpi-zona-semana')).toHaveText('75 %');
  await expect(page.locator('#kpi-zona-semana-estado')).toHaveText('Urgente');
  // Gráficas: SVG con descripción por marca, leyenda en texto y la tabla equivalente
  const asistencia = page.locator('#grafica-asistencia svg');
  await expect(asistencia).toHaveAttribute('role', 'img');
  await expect(asistencia.locator('rect.g-ok')).toHaveCount(2);
  await expect(asistencia.locator('rect.g-aviso')).toHaveCount(1);
  await expect(asistencia.locator('rect.g-critico')).toHaveCount(1);
  await expect(asistencia.locator('rect.g-aviso title')).toHaveText('mar 6 · Retardo: 1');
  await expect(page.locator('#seccion-metricas .leyenda')).toContainText('A tiempoRetardoSin checar');
  await expect(page.locator('#tabla-asistencia tbody tr')).toHaveCount(4);
  await expect(page.locator('#tabla-asistencia tbody tr').nth(2)).toHaveText('mié 70011');
  await expect(page.locator('#grafica-horas svg .g-meta-texto')).toHaveText('Meta 40 h');
  await expect(page.locator('#tabla-horas tbody tr')).toHaveText(['Asesor de Prueba15:28 h']);
  await expect(page.locator('#grafica-zona svg .g-valor')).toHaveText('75%');
  await expect(page.locator('#tabla-zona tbody tr')).toHaveCount(8);
  // Las tablas quedan plegadas; la gráfica es lo primero
  await expect(page.locator('#tabla-asistencia')).toBeHidden();
  // Requiere atención: hoy todo en regla; nada por revisar en la bandeja
  await expect(page.locator('#lista-atencion')).toContainText('Nada pendiente por ahora.');
  await expect(page.locator('#kpi-pendientes')).toHaveText('0');
  await expect(page.locator('#kpi-pendientes-estado')).toHaveText('Bien');
});

test('panel en el teléfono: el menú incluye Métricas y nada se sale de la pantalla', async ({ page }) => {
  await abrirPanel(page, { ancho: 375 });
  await expect(page.locator('.panel__menu a[href="#seccion-metricas"]')).toBeVisible();
  const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(desborde).toBeLessThanOrEqual(0);
  const caja = await page.locator('#grafica-asistencia svg').boundingBox();
  expect(caja.width).toBeLessThanOrEqual(375);
  expect(caja.width).toBeGreaterThan(250);
  // Se dibuja al ancho real (sin encoger): la letra de las gráficas se ve de 13 px
  const escala = await page.locator('#grafica-asistencia svg').evaluate((svg) => svg.getBoundingClientRect().width / svg.viewBox.baseVal.width);
  expect(escala).toBeGreaterThan(0.97);
  await expect(page.locator('#grafica-asistencia svg .g-eje').first()).toHaveCSS('font-size', '13px');
});
