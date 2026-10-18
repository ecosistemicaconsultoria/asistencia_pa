// UX-02 · Nombre y logotipo «Presente»: el manifiesto, las páginas y los avisos usan el nombre nuevo, y los íconos
// tienen nombre de archivo nuevo (así el navegador y el teléfono no reutilizan la imagen anterior guardada).
import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';

const RAIZ = new URL('..', import.meta.url);
const leer = (f) => readFileSync(new URL(f, RAIZ), 'utf8');

test('manifiesto: nombre «Presente» e íconos nuevos que existen', () => {
  const m = JSON.parse(leer('manifest.json'));
  expect(m.short_name).toBe('Presente');
  expect(m.name).toBe('Presente · Registro de jornada');
  for (const i of m.icons) {
    expect(i.src).toMatch(/^assets\/presente-/);
    expect(existsSync(new URL(i.src, RAIZ)), i.src).toBe(true);
  }
});

test('ninguna página ni aviso muestra el nombre anterior; todas usan los íconos nuevos', () => {
  for (const f of ['index.html', 'panel.html', 'instalar.html', 'reporte.html', 'sw.js', 'js/recordatorio.js']) {
    const texto = leer(f);
    expect(texto, f).not.toMatch(/<title>[^<]*Asistencia|'Asistencia'|"Asistencia"|>Asistencia</);
    expect(texto, f).not.toMatch(/assets\/(icon-|apple-touch-icon|favicon-32)/);
  }
  for (const f of ['index.html', 'panel.html', 'instalar.html']) expect(leer(f), f).toContain('Presente');
});

test('la pantalla de acceso muestra «Presente» con su logotipo', async ({ page }) => {
  await page.goto('index.html');
  await expect(page.locator('#pantalla-acceso .marca__nombre')).toHaveText('Presente');
  await expect(page.locator('#pantalla-acceso .marca__sub')).toHaveText('Registro de jornada');
  await expect(page.locator('#pantalla-acceso img.logo')).toHaveAttribute('src', 'assets/presente-192.png');
  expect(await page.locator('#pantalla-acceso img.logo').evaluate((img) => img.naturalWidth)).toBe(192);
  await expect(page).toHaveTitle('Presente · Registro de jornada');
});
