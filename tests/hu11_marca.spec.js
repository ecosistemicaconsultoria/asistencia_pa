// HU-11 · Marca por organización: color principal configurable por administración, con contraste AA obligatorio;
// se aplica en la app, el panel y la barra del teléfono; la pantalla de acceso conserva el color de omisión.
// Datos ficticios.
import { test, expect } from '@playwright/test';
import { simularSupabase, entrar, USUARIOS } from './simulador.js';
import { normalizarHex, validarColor, oscurecer, colorDe, contraste, COLOR_DEFECTO } from '../js/marca.js';

const AZUL = '#1E3A8A';

test('lógica: formato, contraste mínimo en botones y textos, y respaldo al color de omisión', () => {
  expect([normalizarHex('1e3a8a'), normalizarHex('#abc'), normalizarHex('azul'), normalizarHex('')]).toEqual(['#1E3A8A', '#AABBCC', null, null]);
  expect(contraste('#FFFFFF', '#000000')).toBe(21);
  expect(validarColor(COLOR_DEFECTO)).toMatchObject({ ok: true, color: '#14503A' });
  expect(validarColor(AZUL).ok).toBe(true);
  const salvia = validarColor('#7E9A76');   // color de gráficos, no de texto: demasiado claro
  expect(salvia).toMatchObject({ ok: false, mensaje: 'Muy claro: el texto no se leería bien. Elige un tono más oscuro.' });
  expect(salvia.conBlanco).toBeLessThan(4.5);
  expect(validarColor('rojo')).toMatchObject({ ok: false, color: null });
  expect(oscurecer('#14503A')).toBe('#0E3829');
  expect([colorDe({ color_primario: AZUL }), colorDe({ color_primario: '#7E9A76' }), colorDe({}), colorDe(null)]).toEqual([AZUL, COLOR_DEFECTO, COLOR_DEFECTO, COLOR_DEFECTO]);
});

test('app del asesor: usa el color de su organización; al cerrar sesión vuelve el de omisión', async ({ page }) => {
  await simularSupabase(page, { sitiosPA: 5, configPA: { color_primario: AZUL } });
  await page.goto('index.html');
  await expect(page.locator('#form-acceso button[type="submit"]')).toHaveCSS('background-color', 'rgb(20, 80, 58)');
  await entrar(page, USUARIOS.asesor);
  await expect(page.locator('#pantalla-app')).toBeVisible();
  await expect(page.locator('#boton-principal')).toHaveCSS('background-color', 'rgb(30, 58, 138)');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', AZUL);
  await page.locator('[data-pestana="perfil"]').click();
  await page.locator('#perfil-salir').click();
  await expect(page.locator('#pantalla-acceso')).toBeVisible();
  await expect(page.locator('#form-acceso button[type="submit"]')).toHaveCSS('background-color', 'rgb(20, 80, 58)');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', COLOR_DEFECTO);
});

test('panel: administración prueba un color, el claro no se puede guardar, guarda uno legible y lo restablece', async ({ page }) => {
  const sim = await simularSupabase(page, { sitiosPA: 5 });
  await page.goto('index.html');
  await entrar(page, USUARIOS.admin);
  await expect(page.locator('#pantalla-app')).toBeVisible();
  await page.goto('panel.html');
  await expect(page.locator('#menu-respaldos')).toHaveText('Organización');
  await expect(page.locator('#marca-hex')).toHaveValue('#14503A');
  await expect(page.locator('#marca-contraste')).toContainText('Se lee bien');
  // Demasiado claro: no se puede guardar
  await page.locator('#marca-hex').fill('#7E9A76');
  await expect(page.locator('#marca-contraste')).toContainText('Muy claro');
  await expect(page.locator('#marca-guardar')).toBeDisabled();
  // Legible: vista previa y guardado
  await page.locator('#marca-hex').fill('#1e3a8a');
  await expect(page.locator('#marca-vista .marca__boton')).toHaveCSS('background-color', 'rgb(30, 58, 138)');
  await expect(page.locator('#marca-guardar')).toBeEnabled();
  await page.locator('#marca-guardar').click();
  await expect(page.locator('#marca-aviso')).toHaveText('Listo: todas las personas verán este color la próxima vez que abran la app.');
  await expect(page.locator('#marca-guardar')).toHaveCSS('background-color', 'rgb(30, 58, 138)');   // el panel ya usa el nuevo
  expect(sim.estado.bitacora.filter((b) => b.accion === 'MARCA').map((b) => b.datos)).toEqual([{ color_anterior: null, color_nuevo: AZUL }]);
  // La app lo toma al volver a abrir
  await page.goto('index.html');
  await expect(page.locator('#pantalla-app')).toBeVisible();
  await expect(page.locator('#boton-principal')).toHaveCSS('background-color', 'rgb(30, 58, 138)');
  // Restablecer
  await page.goto('panel.html');
  await expect(page.locator('#marca-hex')).toHaveValue(AZUL);
  await page.locator('#marca-restablecer').click();
  await expect(page.locator('#marca-aviso')).toContainText('Listo');
  await expect(page.locator('#marca-hex')).toHaveValue(COLOR_DEFECTO);
  await expect(page.locator('#marca-guardar')).toHaveCSS('background-color', 'rgb(20, 80, 58)');
  expect(sim.estado.bitacora.filter((b) => b.accion === 'MARCA')).toHaveLength(2);
});

test('coordinación no ve la sección Organización', async ({ page }) => {
  await simularSupabase(page, { sitiosPA: 5 });
  await page.goto('index.html');
  await entrar(page, USUARIOS.coordinador);
  await expect(page.locator('#pantalla-app')).toBeVisible();
  await page.goto('panel.html');
  await expect(page.locator('#metricas-estado')).toContainText('Actualizado');
  await expect(page.locator('#menu-respaldos')).toBeHidden();
  await expect(page.locator('#seccion-respaldos')).toBeHidden();
});

test('contra la API local (función real): administración cambia su color; coordinación no', async ({ page }) => {
  const { apiLocalDisponible, conectarApiLocal, CUENTAS } = await import('./api_local.js');
  test.skip(!(await apiLocalDisponible()), 'API local apagada: corre supabase/tests/e2e/levantar_api_local.sh');
  await conectarApiLocal(page);
  await page.goto('index.html');
  await entrar(page, CUENTAS.coordPA);
  await expect(page.locator('#pantalla-app')).toBeVisible();
  const coord = await page.evaluate(async () => {
    const api = await import('./js/api.js');
    try { await api.cambiarMarca('11111111-1111-1111-1111-111111111111', '#1E3A8A'); return 'cambió'; } catch (e) { return e.message; }
  });
  expect(coord).toContain('Solo administración');
  await page.locator('[data-pestana="perfil"]').click();
  await page.locator('#perfil-salir').click();
  await entrar(page, CUENTAS.adminDemo);
  await expect(page.locator('#pantalla-app')).toBeVisible();
  const admin = await page.evaluate(async () => {
    const api = await import('./js/api.js');
    const r = await api.cambiarMarca('22222222-2222-2222-2222-222222222222', '#1e3a8a');
    const vuelta = await api.cambiarMarca('22222222-2222-2222-2222-222222222222', '');
    return { r, vuelta };
  });
  expect(admin).toEqual({ r: { color_primario: '#1E3A8A' }, vuelta: { color_primario: null } });
});
