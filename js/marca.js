// Marca por organización (HU-11): el color principal de la app (botones, encabezados, enlaces) sale de
// organizaciones.config.color_primario. Por omisión, el verde de Ecosistémica.
// Un color solo se acepta si se lee bien: texto blanco sobre él y él como texto sobre el fondo hueso, ambos con
// contraste AA (4.5:1). Se cambia desde el panel (Organización › Marca) con la función del servidor cambiar_marca.
export const COLOR_DEFECTO = '#14503A';
const HUESO = '#F4F2EC';
const BLANCO = '#FFFFFF';
export const CONTRASTE_MINIMO = 4.5;

export function normalizarHex(valor) {
  const t = String(valor ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(t)) return `#${t.split('').map((c) => c + c).join('')}`.toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(t)) return `#${t}`.toUpperCase();
  return null;
}
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function luminancia(hex) {
  const [r, g, b] = rgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}

// { ok, color, conBlanco, conFondo, mensaje }
export function validarColor(valor) {
  const color = normalizarHex(valor);
  if (!color) return { ok: false, color: null, mensaje: 'Escribe un color en formato hexadecimal, por ejemplo #14503A.' };
  const conBlanco = contraste(color, BLANCO);
  const conFondo = contraste(color, HUESO);
  const ok = conBlanco >= CONTRASTE_MINIMO && conFondo >= CONTRASTE_MINIMO;
  return { ok, color, conBlanco, conFondo,
    mensaje: ok ? 'Se lee bien: contraste suficiente en botones y textos.' : 'Muy claro: el texto no se leería bien. Elige un tono más oscuro.' };
}

// Tono más oscuro para el efecto al presionar
export function oscurecer(hex, factor = 0.3) {
  return `#${rgb(hex).map((v) => Math.round(v * (1 - factor)).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

// Color que corresponde a la organización (si el guardado no fuera válido, se usa el de omisión)
export function colorDe(config) {
  const v = validarColor(config?.color_primario);
  return v.ok ? v.color : COLOR_DEFECTO;
}

// Aplica el color en la página (variables CSS y barra del navegador/teléfono)
export function aplicarMarca(config, doc = document) {
  const color = colorDe(config);
  const raiz = doc.documentElement.style;
  if (color === COLOR_DEFECTO) { raiz.removeProperty('--verde'); raiz.removeProperty('--verde-oscuro'); }
  else { raiz.setProperty('--verde', color); raiz.setProperty('--verde-oscuro', oscurecer(color)); }
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  return color;
}
