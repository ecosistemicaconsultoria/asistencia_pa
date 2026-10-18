// HU-34 · Respaldos y conservación: ZIP con un CSV por tabla y LEEME con huellas SHA-256; constancia en la tabla
// `respaldos` (migración 0006); solo administración; aviso en "Requiere atención" si no hay respaldo reciente.
// El ZIP lo abre y lo comprueba Python (zipfile), independiente de nuestro código. Datos ficticios.
import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simularSupabase, entrar, eventoServidor as ev, incidenciaServidor, USUARIOS } from './simulador.js';
import { armarZip, crc32 } from '../js/zip.js';
import { csv, archivosDelRespaldo, armarRespaldo } from '../js/respaldo.js';

const sha = (b) => createHash('sha256').update(b).digest('hex');
// Abre el ZIP con Python: comprueba CRC de cada archivo y devuelve { nombre: texto }
function abrirZip(bytes) {
  const dir = mkdtempSync(join(tmpdir(), 'respaldo-'));
  const ruta = join(dir, 'r.zip');
  writeFileSync(ruta, bytes);
  const salida = execFileSync('python3', ['-I', '-c', `
import zipfile, json, sys
z = zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None, 'CRC'
print(json.dumps({n: z.read(n).decode('utf-8') for n in z.namelist()}))`, ruta]);
  return JSON.parse(salida.toString());
}

test('ZIP propio: válido para Python, con nombres UTF-8 y contenido idéntico', () => {
  expect(crc32(new TextEncoder().encode('123456789')).toString(16)).toBe('cbf43926');   // valor de referencia del CRC-32
  const enc = new TextEncoder();
  const zip = armarZip([{ nombre: 'LEEME.txt', bytes: enc.encode('hola') }, { nombre: 'año.csv', bytes: enc.encode('a,b\r\nñ,"x"\r\n') }], new Date('2026-10-08T10:00:00'));
  expect(abrirZip(zip)).toEqual({ 'LEEME.txt': 'hola', 'año.csv': 'a,b\r\nñ,"x"\r\n' });
});

test('CSV del respaldo: BOM, comillas, saltos de línea y textos que Excel tomaría como fórmula', () => {
  const t = csv([{ a: '=SUMA(A1)', b: 'dijo "hola", y\nse fue', c: null }], [['a', (f) => f.a, { libre: true }], ['b', (f) => f.b, { libre: true }], ['c', (f) => f.c]]);
  expect(t).toBe('﻿a,b,c\r\n\'=SUMA(A1),"dijo ""hola"", y\nse fue",\r\n');
  const archivos = archivosDelRespaldo({
    personas: [{ id: 'm1', nombre_completo: 'Ana Ficticia', num_empleado: 'F-1', rol: 'asesor', activo: true, fecha_alta: '2026-01-01', fecha_baja: null }],
    eventos: [{ id: 'e1', miembro_id: 'm1', tipo: 'inicio_bloque', bloque: 'campo', modalidad: 'presencial', hora_efectiva: '2026-09-07T23:00:00Z', sitio_id: 's1',
      dentro_geocerca: false, motivos_revision: ['fuera_de_geocerca'], justificacion: '-junto al parque', capturado_sin_conexion: true, selfie_path: 'org/m1/2026/09/e1.webp' }],
    revisiones: [], incidencias: [], bitacora: [{ id: 1, tabla: 'miembros', registro_id: 'm1', accion: 'ALTA', actor: 'u1', datos: { rol: 'asesor' }, en: '2026-09-01T15:00:00Z' }],
    sitios: [{ id: 's1', clave: 'F-0001', nombre: 'Parque Ficticio 001' }]
  }, { zona: 'America/Mazatlan' });
  expect(archivos.map((a) => [a.nombre, a.filas])).toEqual([['checadas.csv', 1], ['revisiones.csv', 0], ['incidencias.csv', 0], ['bitacora.csv', 1], ['personas.csv', 1]]);
  const fila = archivos[0].texto.split('\r\n')[1];
  expect(fila).toContain('F-1,Ana Ficticia,m1,inicio_bloque,campo,presencial,2026-09-07 16:00:00,2026-09-07T23:00:00Z');
  expect(fila).toContain('F-0001,Parque Ficticio 001,s1,,no,,fuera_de_geocerca,\'-junto al parque,org/m1/2026/09/e1.webp');
  expect(archivos[3].texto).toContain('"{""rol"":""asesor""}"');
});

test('respaldo completo: las huellas del LEEME coinciden con los archivos', async () => {
  const datos = { personas: [], eventos: [], revisiones: [], incidencias: [], bitacora: [], sitios: [] };
  const r = await armarRespaldo(datos, { organizacion: 'IAP Ficticia', desde: '2026-09-01', hasta: '2026-09-30', por: 'Admin Ficticia', zona: 'America/Mazatlan' });
  const dentro = abrirZip(r.zip);
  expect(Object.keys(dentro)).toEqual(['LEEME.txt', 'checadas.csv', 'revisiones.csv', 'incidencias.csv', 'bitacora.csv', 'personas.csv']);
  for (const a of r.archivos) {
    expect(sha(Buffer.from(dentro[a.nombre], 'utf8')), a.nombre).toBe(a.sha256);
    expect(dentro['LEEME.txt']).toContain(`${a.nombre} · 0 filas · ${a.sha256}`);
  }
  expect(dentro['LEEME.txt']).toContain('certutil -hashfile');
  expect(r.sha256Zip).toBe(sha(r.zip));
});

const EVENTOS = [
  ev('inicio_bloque', '2026-09-07T16:00', { bloque: 'campo', justificacion: '=HIPERVINCULO("x")' }), ev('fin_bloque', '2026-09-07T20:00', { bloque: 'campo' }),
  ev('inicio_bloque', '2026-08-31T16:00', { bloque: 'campo' }),   // fuera del periodo
  ev('inicio_bloque', '2026-10-05T16:00', { bloque: 'campo' })    // fuera del periodo
];

async function abrirPanel(page, usuario) {
  await page.clock.setFixedTime(new Date('2026-10-08T10:00:00-07:00'));
  const sim = await simularSupabase(page, { sitiosPA: 5, eventos: EVENTOS.map((x) => ({ ...x })),
    incidencias: [incidenciaServidor('omision', { creada_en: '2026-09-10T18:00:00.000Z' })] });
  sim.estado.bitacora.push({ id: 900, organizacion_id: '11111111-1111-1111-1111-111111111111', tabla: 'miembros', registro_id: 'x', accion: 'ALTA', actor: 'u', datos: {}, en: '2026-09-02T15:00:00.000Z' });
  await page.goto('index.html');
  await entrar(page, usuario);
  await expect(page.locator('#pantalla-app')).toBeVisible();
  await page.goto('panel.html');
  await expect(page.locator('#metricas-estado')).toContainText('Actualizado');
  return sim;
}

test('administración: descarga el ZIP del mes anterior, queda la constancia y se quita el aviso', async ({ page }) => {
  const sim = await abrirPanel(page, USUARIOS.admin);
  await expect(page.locator('#menu-respaldos')).toBeVisible();
  await expect(page.locator('#respaldo-desde')).toHaveValue('2026-09-01');
  await expect(page.locator('#respaldo-hasta')).toHaveValue('2026-09-30');
  await expect(page.locator('#respaldos-lista')).toHaveText('Todavía no hay respaldos.');
  await expect(page.locator('#lista-atencion')).toContainText('Aún no hay ningún respaldo');
  // Validación del periodo
  await page.locator('#respaldo-desde').fill('2026-10-01');
  await page.locator('#respaldo-descargar').click();
  await expect(page.locator('#respaldo-error')).toHaveText('La fecha "desde" debe ser anterior o igual a "hasta".');
  await page.locator('#respaldo-desde').fill('2026-09-01');

  const [descarga] = await Promise.all([page.waitForEvent('download'), page.locator('#respaldo-descargar').click()]);
  expect(descarga.suggestedFilename()).toBe('respaldo_parques-alegres_2026-09-01_2026-09-30.zip');
  const bytes = readFileSync(await descarga.path());
  const dentro = abrirZip(bytes);
  expect(dentro['checadas.csv'].trim().split('\r\n')).toHaveLength(3);   // encabezado + 2 checadas de septiembre
  expect(dentro['checadas.csv']).toContain('\'=HIPERVINCULO');
  expect(dentro['incidencias.csv'].trim().split('\r\n')).toHaveLength(2);
  expect(dentro['bitacora.csv']).toContain('miembros,x,ALTA');
  expect(dentro['LEEME.txt']).toContain('Organización: Parques Alegres IAP');
  expect(dentro['LEEME.txt']).toContain('Por: Administración de Prueba');
  // Constancia: huella del ZIP descargado y de cada archivo
  expect(sim.estado.respaldos).toHaveLength(1);
  const c = sim.estado.respaldos[0];
  expect(c).toMatchObject({ organizacion_id: '11111111-1111-1111-1111-111111111111', desde: '2026-09-01', hasta: '2026-09-30', sha256_zip: sha(bytes) });
  expect(c.archivos.find((a) => a.nombre === 'checadas.csv')).toEqual({ nombre: 'checadas.csv', filas: 2, sha256: sha(Buffer.from(dentro['checadas.csv'], 'utf8')) });
  await expect(page.locator('#respaldo-estado')).toContainText(`Huella del ZIP: ${sha(bytes).slice(0, 12)}`);
  await expect(page.locator('#respaldos-lista li')).toHaveCount(1);
  await expect(page.locator('#respaldos-lista')).toContainText('1 sep – 30 sep 2026');
  await expect(page.locator('#respaldos-lista')).toContainText('Administración de Prueba');
  await expect(page.locator('#lista-atencion')).not.toContainText('respaldo');
});

test('coordinación no ve la sección de respaldos', async ({ page }) => {
  await abrirPanel(page, USUARIOS.coordinador);
  await expect(page.locator('#menu-respaldos')).toBeHidden();
  await expect(page.locator('#seccion-respaldos')).toBeHidden();
  await expect(page.locator('#lista-atencion')).not.toContainText('respaldo');
});

test('contra la API local (RLS y triggers reales): administración respalda y deja constancia; coordinación no', async ({ page }) => {
  const { apiLocalDisponible, conectarApiLocal, CUENTAS } = await import('./api_local.js');
  test.skip(!(await apiLocalDisponible()), 'API local apagada: corre supabase/tests/e2e/levantar_api_local.sh');
  await conectarApiLocal(page);
  await page.goto('index.html');
  await entrar(page, CUENTAS.coordPA);
  await expect(page.locator('#pantalla-app')).toBeVisible();
  const coord = await page.evaluate(async () => {
    const api = await import('./js/api.js');
    const r = {};
    try { await api.registrarRespaldo('11111111-1111-1111-1111-111111111111', { desde: '2026-09-01', hasta: '2026-09-30', archivos: [], sha256Zip: 'a'.repeat(64) }); r.registro = 'registró'; }
    catch (e) { r.registro = e.message; }
    r.lista = (await api.respaldosDeOrganizacion('11111111-1111-1111-1111-111111111111')).length;
    return r;
  });
  expect(coord.registro).toMatch(/Solo administración|row-level security/);
  expect(coord.lista).toBe(0);

  await page.locator('[data-pestana="perfil"]').click();
  await page.locator('#perfil-salir').click();
  await entrar(page, CUENTAS.adminDemo);
  await expect(page.locator('#pantalla-app')).toBeVisible();
  const admin = await page.evaluate(async () => {
    const api = await import('./js/api.js');
    const org = '22222222-2222-2222-2222-222222222222';
    const datos = await api.datosDeRespaldo(org, '2020-01-01T00:00:00Z', '2100-01-01T00:00:00Z');
    await api.registrarRespaldo(org, { desde: '2026-09-01', hasta: '2026-09-30', archivos: [{ nombre: 'checadas.csv', filas: datos.eventos.length, sha256: 'b'.repeat(64) }], sha256Zip: 'c'.repeat(64) });
    const lista = await api.respaldosDeOrganizacion(org);
    return { tablas: Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, Array.isArray(v)])), personas: datos.personas.length, ultimo: lista[0] };
  });
  expect(admin.tablas).toEqual({ eventos: true, revisiones: true, incidencias: true, bitacora: true, personas: true });
  expect(admin.personas).toBeGreaterThan(0);
  expect(admin.ultimo).toMatchObject({ desde: '2026-09-01', hasta: '2026-09-30', sha256_zip: 'c'.repeat(64), autor: { nombre_completo: 'Admin Demo' } });
});
