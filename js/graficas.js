// Gráficas del panel (HU-39) en SVG propio: sin librerías, funcionan con lo que ya trae la app.
// Reglas (revisión de visualización de datos): marcas delgadas con puntas redondeadas, 2 px de separación entre
// segmentos, leyenda + etiquetas de texto (el color nunca va solo), cuadrícula tenue, una sola escala, y la
// descripción de cada marca al pasar el dedo o el ratón (<title>). Los colores salen de css/app.css (--serie-*).
// Se dibujan al ancho real del contenedor (1 unidad = 1 px) para que el texto no se encoja en el teléfono.
// Todo se arma con createElementNS y textContent: los nombres vienen de la base y nunca se insertan como HTML.
const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, ...hijos) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, String(v));
  for (const h of hijos) n.append(typeof h === 'string' ? document.createTextNode(h) : h);
  return n;
}
const titulo = (texto) => el('title', {}, texto);
function lienzo(ancho, alto, etiqueta) {
  return el('svg', { viewBox: `0 0 ${ancho} ${alto}`, class: 'grafica', role: 'img', 'aria-label': etiqueta, preserveAspectRatio: 'xMidYMid meet' });
}

// Barras apiladas por día: a tiempo / retardo / sin checar. dias: [{ etiqueta, aTiempo, retardo, sinChecar, programadas }]
export function barrasAsistencia(dias, { etiqueta = 'Asistencia por día', ancho = 440 } = {}) {
  const W = ancho, H = 230, x0 = 30, y0 = 26, yb = 196;
  const tope = Math.max(1, ...dias.map((d) => d.programadas));
  const paso = tope <= 5 ? 1 : tope <= 10 ? 2 : tope <= 25 ? 5 : 10;
  const svg = lienzo(W, H, etiqueta);
  const y = (v) => yb - ((yb - y0) * v) / tope;
  for (let v = 0; v <= tope; v += paso) {
    svg.append(el('line', { x1: x0, x2: W - 6, y1: y(v), y2: y(v), class: 'g-rejilla' }), el('text', { x: x0 - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'g-eje' }, String(v)));
  }
  const n = Math.max(dias.length, 1);
  const hueco = (W - x0 - 6) / n;
  const bw = Math.min(48, hueco * 0.62);
  dias.forEach((d, i) => {
    const x = x0 + hueco * i + (hueco - bw) / 2;
    let base = 0;
    for (const [valor, clase, nombre] of [[d.aTiempo, 'g-ok', 'A tiempo'], [d.retardo, 'g-aviso', 'Retardo'], [d.sinChecar, 'g-critico', 'Sin checar']]) {
      if (!valor) continue;
      const alto = y(base) - y(base + valor);
      svg.append(el('rect', { x, y: y(base + valor) + 1, width: bw, height: Math.max(alto - 2, 1), rx: 3, class: clase }, titulo(`${d.etiqueta} · ${nombre}: ${valor}`)));
      base += valor;
    }
    const llegaron = d.aTiempo + d.retardo;
    svg.append(el('text', { x: x + bw / 2, y: y(base) - 7, 'text-anchor': 'middle', class: 'g-valor' }, `${llegaron}/${d.programadas}`));
    svg.append(el('text', { x: x + bw / 2, y: yb + 18, 'text-anchor': 'middle', class: 'g-eje' }, d.etiqueta));
  });
  return svg;
}

// Barras horizontales: horas por persona con la meta semanal como línea punteada. filas: [{ nombre, minutos }]
export function barrasHoras(filas, metaMinutos, { etiqueta = 'Horas de la semana por persona', ancho = 440 } = {}) {
  const fila = 30, W = ancho, x0 = W < 380 ? 92 : 112, xValor = W - 6, largoMax = W - x0 - 64;
  const H = Math.max(filas.length, 1) * fila + 34;
  const tope = Math.max(metaMinutos * 1.1, ...filas.map((f) => f.minutos)) || 1;
  const x = (m) => x0 + (largoMax * m) / tope;
  const svg = lienzo(W, H, etiqueta);
  filas.forEach((f, i) => {
    const yy = 6 + i * fila;
    const max = W < 380 ? 11 : 15;
    const corto = f.nombre.length > max ? `${f.nombre.slice(0, max - 1)}…` : f.nombre;
    svg.append(el('text', { x: x0 - 8, y: yy + 15, 'text-anchor': 'end', class: 'g-eje g-eje--nombre' }, corto, titulo(f.nombre)));
    const largo = Math.max(x(f.minutos) - x0, f.minutos ? 3 : 0);
    if (largo) svg.append(el('rect', { x: x0, y: yy + 4, width: largo, height: 16, rx: 4, class: 'g-serie' }, titulo(`${f.nombre}: ${horasTexto(f.minutos)}`)));
    svg.append(el('text', { x: xValor, y: yy + 16, 'text-anchor': 'end', class: 'g-valor' }, horasTexto(f.minutos)));
  });
  const xm = x(metaMinutos);
  svg.append(el('line', { x1: xm, x2: xm, y1: 2, y2: H - 22, class: 'g-meta' }));
  svg.append(el('text', { x: xm, y: H - 6, 'text-anchor': 'middle', class: 'g-meta-texto' }, `Meta ${Math.round(metaMinutos / 60)} h`));
  return svg;
}
export const horasTexto = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')} h`;

// Línea: % de checadas dentro de zona por semana. semanas: [{ etiqueta, pct (null = sin datos) }]
export function lineaZona(semanas, { etiqueta = 'Checadas dentro de zona por semana', ancho = 440 } = {}) {
  const W = ancho, H = 180, x0 = 44, y0 = 14, yb = 148, xf = W - 56;
  const valores = semanas.map((s) => s.pct).filter((v) => v !== null);
  const minimo = valores.length ? Math.max(0, Math.floor((Math.min(...valores) - 5) / 10) * 10) : 0;
  const y = (v) => yb - ((yb - y0) * (v - minimo)) / (100 - minimo || 1);
  const x = (i) => x0 + 8 + (i * (xf - x0 - 8)) / Math.max(semanas.length - 1, 1);
  const svg = lienzo(W, H, etiqueta);
  for (const v of [minimo, Math.round((minimo + 100) / 2), 100]) {
    svg.append(el('line', { x1: x0, x2: xf, y1: y(v), y2: y(v), class: 'g-rejilla' }), el('text', { x: x0 - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'g-eje' }, `${v}%`));
  }
  // La línea se corta en las semanas sin datos (no se inventa un valor)
  let tramo = [];
  const cerrar = () => { if (tramo.length > 1) svg.append(el('polyline', { points: tramo.join(' '), class: 'g-linea' })); tramo = []; };
  semanas.forEach((s, i) => { if (s.pct === null) cerrar(); else tramo.push(`${x(i)},${y(s.pct)}`); });
  cerrar();
  semanas.forEach((s, i) => {
    if (s.pct === null) return;
    const ultimo = i === semanas.length - 1;
    // Área táctil amplia (invisible) con la descripción; el punto visible solo en la última semana
    svg.append(el('circle', { cx: x(i), cy: y(s.pct), r: 12, class: 'g-toque' }, titulo(`${s.etiqueta}: ${s.pct}% (${s.dentro} de ${s.checadas})`)));
    if (ultimo) {
      svg.append(el('circle', { cx: x(i), cy: y(s.pct), r: 5, class: 'g-punto' }));
      svg.append(el('text', { x: x(i) + 10, y: y(s.pct) + 4, class: 'g-valor' }, `${s.pct}%`));
    }
  });
  semanas.forEach((s, i) => {
    if (i === 0 || i === semanas.length - 1) svg.append(el('text', { x: x(i), y: yb + 20, 'text-anchor': 'middle', class: 'g-eje' }, i === 0 ? 'hace 7 sem' : 'esta sem'));
  });
  return svg;
}
