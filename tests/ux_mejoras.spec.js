// Mejoras de usabilidad (revisión UI/UX, v30): checada con confirmar siempre a la mano y el motivo cuando aún no se
// puede, ubicación plegable, acciones delicadas discretas, contraste de días futuros, «reducir movimiento» e íconos SVG.
// Lunes 5-oct-2026 (Culiacán). Datos ficticios.
import { test, expect } from '@playwright/test';
import { simularSupabase, entrar, tomarSelfie, eventoServidor as ev, USUARIOS } from './simulador.js';

const PARQUE_1 = { latitude: 24.7601, longitude: -107.4301, accuracy: 8 };
const ENTRE_PARQUES = { latitude: 24.7615, longitude: -107.4285, accuracy: 8 };

async function abrir(page, context, hora, { gps = PARQUE_1, eventos = [], usuario = USUARIOS.asesor } = {}) {
  await page.clock.setFixedTime(new Date(`2026-10-05T${hora}:00-07:00`));
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(gps);
  const sim = await simularSupabase(page, { eventos, sitiosPA: 60 });
  await page.goto('index.html');
  await entrar(page, usuario);
  await expect(page.locator('#pantalla-app')).toBeVisible();
  await page.locator('[data-pestana="visitas"]').click();
  await expect(page.locator('#catalogo-estado')).toContainText('actualizado');
  await page.locator('[data-pestana="inicio"]').click();
  return sim;
}

// Contraste WCAG entre el color del texto y el fondo efectivo (subiendo hasta el primer fondo opaco)
async function contraste(locator) {
  return locator.evaluate((el) => {
    const rgb = (c) => c.match(/[\d.]+/g).map(Number);
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    let fondo = null;
    for (let n = el; n && !fondo; n = n.parentElement) {
      const c = rgb(getComputedStyle(n).backgroundColor);
      if (c.length === 3 || c[3] === 1) fondo = c.slice(0, 3);
    }
    fondo ||= rgb(getComputedStyle(document.body).backgroundColor).slice(0, 3);
    const [a, b] = [lum(rgb(getComputedStyle(el).color).slice(0, 3)), lum(fondo)].sort((x, y) => y - x);
    return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
  });
}

test('checada: confirmar queda a la vista sin desplazarse y dice qué falta; la ubicación va plegada con su resumen', async ({ page, context }) => {
  await abrir(page, context, '16:00');
  await page.locator('#boton-principal').click();
  await expect(page.locator('#pantalla-checada')).toBeVisible();
  await expect(page.locator('#checada-zona')).toHaveText('Dentro de la zona de Parque Ficticio 001.');
  await expect(page.locator('#checada-progreso')).toHaveAttribute('data-buscando', 'false');
  // Detalles plegados, con el resumen a la vista
  await expect(page.locator('#checada-detalles')).not.toHaveAttribute('open', '');
  await expect(page.locator('#checada-resumen')).toHaveText(/^Parque Ficticio 001 · \d+ m · ±8 m$/);
  await expect(page.locator('#checada-mapa')).toBeHidden();
  await page.locator('#checada-detalles summary').click();
  await expect(page.locator('#checada-mapa')).toBeVisible();
  await expect(page.locator('#checada-sitio')).toHaveText('Parque Ficticio 001');
  await page.locator('#checada-detalles summary').click();
  // Sin selfie: botón apagado, con el motivo, y a la vista sin desplazarse (barra fija abajo)
  await expect(page.locator('#checada-confirmar')).toBeDisabled();
  await expect(page.locator('#checada-motivo')).toHaveText('Para confirmar, toma la selfie y elige «Usar esta foto».');
  await expect(page.locator('#checada-confirmar')).toHaveAttribute('aria-describedby', 'checada-motivo');
  const caja = await page.locator('#checada-confirmar').boundingBox();
  expect(caja.y + caja.height).toBeLessThanOrEqual(812);
  expect(caja.height).toBeGreaterThanOrEqual(56);
  // El botón apagado se ve apagado pero se lee (contraste AA)
  expect(await contraste(page.locator('#checada-confirmar-texto'))).toBeGreaterThanOrEqual(4.5);
  await tomarSelfie(page);
  await expect(page.locator('#checada-confirmar')).toBeEnabled();
  await expect(page.locator('#checada-motivo')).toHaveText('');
  await expect(page.locator('#checada-motivo')).toBeHidden();
  await page.locator('#checada-confirmar').click();
  await expect(page.locator('#checada-resultado-titulo')).toHaveText('Registrado');
  // Ícono del resultado: dibujo SVG, no emoji
  await expect(page.locator('#checada-resultado-icono svg')).toHaveCount(1);
  await expect(page.locator('#checada-resultado-icono')).toHaveText('');
});

test('checada fuera de zona: el motivo pide la justificación', async ({ page, context }) => {
  await abrir(page, context, '16:00', { gps: ENTRE_PARQUES });
  await page.locator('#boton-principal').click();
  await tomarSelfie(page);
  await expect(page.locator('#checada-motivo')).toHaveText('Para confirmar, escribe la justificación (mínimo 5 caracteres).');
  await page.locator('#checada-justificacion').fill('Reunión con el comité en la explanada');
  await expect(page.locator('#checada-motivo')).toHaveText('');
  await expect(page.locator('#checada-confirmar')).toBeEnabled();
});

test('acciones: misma acción, mismo color; cerrar sesión discreto y separado; días futuros legibles', async ({ page, context }) => {
  await abrir(page, context, '17:00', { eventos: [ev('inicio_bloque', '2026-10-05T16:00', { bloque: 'campo' })] });
  // "Terminar bloque de campo" se ve igual en Inicio (verde lleno) y en Visitas
  await page.locator('[data-pestana="visitas"]').click();
  const terminar = page.locator('#pantalla-app button:visible', { hasText: 'Terminar bloque de campo' });
  await expect(terminar).toHaveClass(/boton--lleno/);
  await expect(terminar).toHaveCSS('background-color', 'rgb(20, 80, 58)');
  // Cerrar sesión: contorno, no botón lleno
  await page.locator('[data-pestana="perfil"]').click();
  await expect(page.locator('#perfil-salir')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  expect(await contraste(page.locator('#perfil-salir'))).toBeGreaterThanOrEqual(4.5);
  // Días futuros con contraste AA (antes iban con transparencia)
  await page.locator('[data-pestana="historial"]').click();
  const futuro = page.locator('.dia--futuro .lista__titulo').first();
  await expect(futuro).toBeVisible();
  await expect(page.locator('.dia--futuro').first()).toHaveCSS('opacity', '1');
  expect(await contraste(futuro)).toBeGreaterThanOrEqual(4.5);
});

test('«reducir movimiento» del teléfono: sin animaciones ni efecto al tocar', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await abrir(page, context, '16:00');
  const duracion = await page.locator('#boton-principal').evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));
  expect(duracion).toBeLessThan(0.01);
});

test('panel: ayudas plegadas en «Más información» y la baja dentro de Editar', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-05T10:00:00-07:00'));
  await simularSupabase(page, { sitiosPA: 5 });
  await page.goto('index.html');
  await entrar(page, USUARIOS.admin);
  await expect(page.locator('#pantalla-app')).toBeVisible();
  await page.goto('panel.html');
  const ayudas = page.locator('details.ayuda');
  expect(await ayudas.count()).toBeGreaterThanOrEqual(5);
  for (const d of await ayudas.all()) await expect(d).not.toHaveAttribute('open', '');
  await expect(page.getByText('Validar u observar no cambia la checada')).toBeHidden();
  await page.locator('#seccion-revision details.ayuda summary').click();
  await expect(page.getByText('Validar u observar no cambia la checada')).toBeVisible();
  // Personas: "Dar de baja" no está a un toque; aparece al abrir Editar, separado y en contorno
  const tarjeta = page.locator('#seccion-personas article', { hasText: 'Asesor de Prueba' });
  await expect(tarjeta.locator('[data-persona="baja"]')).toBeHidden();
  await tarjeta.locator('[data-persona="editar"]').click();
  await expect(tarjeta.locator('[data-persona="baja"]')).toBeVisible();
  await expect(tarjeta.locator('[data-persona="baja"]')).toHaveClass(/boton--delicado/);
});
