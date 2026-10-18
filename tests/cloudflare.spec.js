// Publicación en Cloudflare Pages: el servidor redirige "x.html" a "x" (direcciones limpias). Con el service worker
// activo, la app, el panel y la guía deben abrir (antes daba ERR_FAILED), también sin señal. El servidor de pruebas
// imita a Cloudflare bajo /cf/ (tests/servidor.mjs).
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { simularSupabase, entrar, USUARIOS } from './simulador.js';

test('con redirecciones tipo Cloudflare: app, panel, guía y reporte abren con el service worker activo, y sin señal', async ({ page, context }) => {
  await simularSupabase(page, { sitiosPA: 5 });
  await page.goto('/cf/index.html');                       // redirige a /cf/
  await expect(page).toHaveURL(/\/cf\/$/);
  await entrar(page, USUARIOS.coordinador);
  await expect(page.locator('#pantalla-app')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  for (const [ruta, visible] of [['/cf/panel.html', '#panel'], ['/cf/index.html', '#pantalla-app'], ['/cf/instalar.html', '.guia__titulo'], ['/cf/panel', '#panel']]) {
    const r = await page.goto(ruta);
    expect(r?.ok(), ruta).toBe(true);
    await expect(page.locator(visible), ruta).toBeVisible();
  }
  // Sin señal: las páginas salen de la copia guardada
  await context.setOffline(true);
  for (const [ruta, visible] of [['/cf/panel.html', ':is(#panel-sin-acceso, #panel, #panel-cargando):visible'], ['/cf/', '#pantalla-app']]) {
    await page.goto(ruta).catch(() => {});
    await expect(page.locator(visible).first(), `${ruta} sin señal`).toBeVisible();
  }
  await context.setOffline(false);
});

test('la app instalada abre en la raíz y Cloudflare recibe encabezados de seguridad', () => {
  expect(JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8')).start_url).toBe('./');
  const h = readFileSync(new URL('../_headers', import.meta.url), 'utf8');
  for (const e of ['X-Content-Type-Options: nosniff', 'X-Frame-Options: DENY', 'Permissions-Policy: geolocation=(self), camera=(self)']) expect(h).toContain(e);
});
