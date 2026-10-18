// HU-25 · Mapa del panel: perímetros de los parques sobre OpenStreetMap (Leaflet) y las checadas del día dentro o
// fuera de zona, con su precisión estimada. El punto es la evidencia: solo se muestra. Sin teletrabajo ni domicilios.
// Los mosaicos se simulan (imagen en blanco): las pruebas no salen a internet. Jueves 8-oct-2026. Datos ficticios.
import { test, expect } from '@playwright/test';
import { simularSupabase, entrar, eventoServidor as ev, USUARIOS } from './simulador.js';
import { claseChecada, describirChecada, sitiosDelMapa } from '../js/mapa.js';

const P1 = 'ffffffff-0000-0000-0000-000000000001';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
const hora = (iso) => new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mazatlan', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));

test('lógica: clase y descripción de cada checada; los domicilios no se dibujan', () => {
  expect([claseChecada({ dentro_geocerca: true }), claseChecada({ dentro_geocerca: false }), claseChecada({ dentro_geocerca: null })]).toEqual(['dentro', 'fuera', 'sin-zona']);
  const c = { tipo: 'inicio_bloque', bloque: 'campo', hora_efectiva: '2026-10-08T23:05:00Z', dentro_geocerca: false, distancia_sitio_m: 98.6, precision_m: 7.6, estado_revision: 'revisar', persona: { nombre_completo: 'Ana Ficticia' } };
  expect(describirChecada(c, 'Parque Ficticio 001', hora)).toEqual({ persona: 'Ana Ficticia', detalle: 'Inicio de bloque · campo · 16:05', zona: 'Fuera de la zona',
    sitio: 'Parque Ficticio 001', distancia: '99 m', precision: '±8 m', revisar: true });
  expect(describirChecada({ ...c, distancia_sitio_m: null, precision_m: null, persona: null }, null, hora)).toMatchObject({ persona: 'Persona', sitio: 'Sin sitio cercano', distancia: '—', precision: '—' });
  expect(sitiosDelMapa([{ id: 'a', tipo: 'parque', lat: 1, lon: 2 }, { id: 'b', tipo: 'domicilio', lat: 1, lon: 2 }, { id: 'c', tipo: 'oficina', lat: null, lon: 2 }]).map((s) => s.id)).toEqual(['a']);
});

const EVENTOS = [
  ev('inicio_bloque', '2026-10-08T16:01', { bloque: 'campo', lat: 24.7601, lon: -107.4301, precision_m: 8, sitio_id: P1, distancia_sitio_m: 0, dentro_geocerca: true }),
  ev('llegada_sitio', '2026-10-08T17:10', { lat: 24.7615, lon: -107.4285, precision_m: 12, sitio_id: P1, distancia_sitio_m: 98, dentro_geocerca: false, estado_revision: 'revisar', motivos_revision: ['fuera_de_geocerca'] }),
  ev('inicio_pausa', '2026-10-08T18:00', { lat: 24.7650, lon: -107.4200, precision_m: 20, dentro_geocerca: null }),
  ev('inicio_bloque', '2026-10-08T09:00', { bloque: 'escritorio', modalidad: 'teletrabajo', lat: 24.79, lon: -107.40, precision_m: 10, dentro_geocerca: null }),   // domicilio: no va al mapa
  ev('inicio_bloque', '2026-10-07T16:00', { bloque: 'campo', lat: 24.7601, lon: -107.4301, precision_m: 8, sitio_id: P1, dentro_geocerca: true })
];

async function abrirMapa(page, { ancho = 1280, sinLeaflet = false } = {}) {
  await page.setViewportSize({ width: ancho, height: 900 });
  await page.clock.setFixedTime(new Date('2026-10-08T20:30:00-07:00'));
  await page.context().route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  if (sinLeaflet) await page.route('**/vendor/leaflet/leaflet.js', (r) => r.abort());
  await simularSupabase(page, { sitiosPA: 12, eventos: EVENTOS.map((x) => ({ ...x })) });
  await page.goto('index.html');
  await entrar(page, USUARIOS.coordinador);
  await expect(page.locator('#pantalla-app')).toBeVisible();
  await page.goto('panel.html');
  await expect(page.locator('#metricas-estado')).toContainText('Actualizado');
  await page.locator('#seccion-mapa').scrollIntoViewIfNeeded();
}

test('panel: perímetros, checadas dentro/fuera con su precisión, ventana con detalle y tabla; sin teletrabajo', async ({ page }) => {
  await abrirMapa(page);
  await expect(page.locator('#mapa-estado')).toHaveText('3 checadas con ubicación · 1 fuera de zona · 12 sitios en el catálogo');
  await expect(page.locator('#mapa-real path.mapa-sitio')).toHaveCount(12);              // 11 polígonos + 1 radio (sin perímetro)
  await expect(page.locator('#mapa-real path.mapa-sitio--radio')).toHaveCount(1);
  await expect(page.locator('#mapa-real path.mapa-checada')).toHaveCount(3);
  await expect(page.locator('#mapa-real path.mapa-checada--dentro')).toHaveCount(1);
  await expect(page.locator('#mapa-real path.mapa-checada--fuera')).toHaveCount(1);
  await expect(page.locator('#mapa-real path.mapa-checada--sin-zona')).toHaveCount(1);
  await expect(page.locator('#mapa-real path.mapa-precision')).toHaveCount(3);
  await expect(page.locator('#mapa-real .leaflet-control-attribution')).toContainText('colaboradores de OpenStreetMap');
  // Ventana de la checada fuera de zona
  await page.locator('#mapa-real path.mapa-checada--fuera').click({ force: true });
  const ventana = page.locator('#mapa-real .mapa-ventana');
  await expect(ventana).toContainText('Asesor de Prueba');
  await expect(ventana).toContainText('Checada: Llegada al parque · 17:10');
  await expect(ventana).toContainText('Zona: Fuera de la zona');
  await expect(ventana).toContainText('Sitio: Parque Ficticio 001');
  await expect(ventana).toContainText('Distancia: 98 m');
  await expect(ventana).toContainText('Precisión estimada: ±12 m');
  await expect(ventana.locator('a[href="#seccion-revision"]')).toHaveText('Ver en la bandeja de revisión');
  // La tabla equivalente (y nada de teletrabajo)
  await expect(page.locator('#tabla-mapa tbody tr')).toHaveCount(3);
  await expect(page.locator('#tabla-mapa')).not.toContainText('escritorio');
  // Otro día
  await page.locator('#mapa-fecha').fill('2026-10-07');
  await expect(page.locator('#mapa-estado')).toHaveText('1 checada con ubicación · 0 fuera de zona · 12 sitios en el catálogo');
  await expect(page.locator('#mapa-real path.mapa-checada')).toHaveCount(1);
  // No hay forma de mover un punto: Leaflet no los deja arrastrables
  expect(await page.locator('#mapa-real .leaflet-marker-draggable').count()).toBe(0);
});

test('panel en el teléfono: el mapa cabe, el menú queda encima del mapa y nada se sale de la pantalla', async ({ page }) => {
  await abrirMapa(page, { ancho: 375 });
  await expect(page.locator('#mapa-real path.mapa-checada')).toHaveCount(3);
  const caja = await page.locator('#mapa-real').boundingBox();
  expect(caja.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  // Con el mapa bajo el menú fijo, el menú sigue siendo lo que se toca
  await page.evaluate(() => { const m = document.getElementById('mapa-real'); window.scrollBy(0, m.getBoundingClientRect().top - 20); });
  const menu = await page.locator('.panel__menu').boundingBox();
  const encima = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.panel__menu') !== null, [menu.x + menu.width / 2, menu.y + menu.height / 2]);
  expect(encima).toBe(true);
});

test('sin la librería del mapa (sin señal): lo dice claro y el resto del panel funciona', async ({ page }) => {
  await abrirMapa(page, { sinLeaflet: true });
  await expect(page.locator('#mapa-estado')).toHaveText('No se pudo cargar el mapa (revisa tu señal y recarga la página).');
  await expect(page.locator('#kpi-puntualidad')).not.toHaveText('—');
});
