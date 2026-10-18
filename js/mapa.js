// Mapa del panel (HU-25): parques con su perímetro sobre un mapa real (Leaflet + OpenStreetMap) y las checadas del
// día, dentro o fuera de su zona. Solo muestra lo que ya está registrado: el punto de cada checada es la evidencia
// y no se puede mover. Las checadas de teletrabajo no se piden (su ubicación es el domicilio de la persona) y los
// domicilios no se dibujan.
// Leaflet (vendor/leaflet, BSD-2-Clause) se carga solo en panel.html como window.L. Necesita señal para los mosaicos.

export const URL_MOSAICOS = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const ATRIBUCION = '© colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const CENTRO_POR_DEFECTO = [24.8069, -107.394];   // Culiacán, solo si no hay ningún sitio

const NOMBRE_TIPO = {
  inicio_bloque: 'Inicio de bloque', fin_bloque: 'Fin de bloque', inicio_pausa: 'Inicio de pausa', fin_pausa: 'Fin de pausa',
  llegada_sitio: 'Llegada al parque', salida_sitio: 'Salida del parque'
};

// Clase visual de una checada: dentro / fuera de zona / zona no aplica (pausas: la zona solo se informa).
export function claseChecada(c) {
  if (c.dentro_geocerca === true) return 'dentro';
  if (c.dentro_geocerca === false) return 'fuera';
  return 'sin-zona';
}

// Texto de la ventana de una checada (también se usa en la tabla). horaCorta: (iso) => 'HH:MM'.
export function describirChecada(c, nombreSitio, horaCorta) {
  const zona = { dentro: 'Dentro de la zona', fuera: 'Fuera de la zona', 'sin-zona': 'Zona no aplica' }[claseChecada(c)];
  return {
    persona: c.persona?.nombre_completo || 'Persona',
    detalle: `${NOMBRE_TIPO[c.tipo] || c.tipo}${c.bloque ? ` · ${c.bloque}` : ''} · ${horaCorta(c.hora_efectiva)}`,
    zona,
    sitio: nombreSitio || 'Sin sitio cercano',
    distancia: c.distancia_sitio_m != null ? `${Math.round(c.distancia_sitio_m)} m` : '—',
    precision: c.precision_m != null ? `±${Math.round(c.precision_m)} m` : '—',
    revisar: c.estado_revision === 'revisar'
  };
}

// Sitios que se dibujan: parques, oficinas y otros con coordenadas; nunca domicilios.
export const sitiosDelMapa = (catalogo) => catalogo.filter((s) => s.tipo !== 'domicilio' && Number.isFinite(s.lat) && Number.isFinite(s.lon));

// GeoJSON MultiPolygon [lon, lat] → anillos [lat, lon] de Leaflet
const anillos = (perimetro) => (perimetro?.coordinates || []).map((poligono) => poligono.map((anillo) => anillo.map(([lon, lat]) => [lat, lon])));

const texto = (etiqueta, valor) => { const p = document.createElement('p'); const b = document.createElement('b'); b.textContent = `${etiqueta}: `; p.append(b, valor); return p; };

// Crea (o reutiliza) el mapa en `contenedor` y dibuja sitios y checadas. Devuelve { sitios, checadas, fuera } dibujados.
let mapa = null, capaSitios = null, capaChecadas = null;
export function dibujarMapa(contenedor, { catalogo, checadas, horaCorta }) {
  const L = window.L;
  if (!L) throw new Error('No se pudo cargar el mapa (revisa tu señal y recarga la página).');
  if (!mapa) {
    mapa = L.map(contenedor, { zoomControl: true, scrollWheelZoom: false, tap: true });
    mapa.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    L.tileLayer(URL_MOSAICOS, { maxZoom: 19, attribution: ATRIBUCION, crossOrigin: true }).addTo(mapa);
    capaSitios = L.layerGroup().addTo(mapa);
    capaChecadas = L.layerGroup().addTo(mapa);
  }
  capaSitios.clearLayers();
  capaChecadas.clearLayers();
  const sitios = sitiosDelMapa(catalogo);
  const porId = new Map(sitios.map((s) => [s.id, s]));
  const limites = [];
  for (const s of sitios) {
    const forma = s.perimetro?.coordinates?.length
      ? L.polygon(anillos(s.perimetro), { className: 'mapa-sitio', weight: 2 })
      : L.circle([s.lat, s.lon], { radius: s.radioM || 80, className: 'mapa-sitio mapa-sitio--radio', weight: 2 });
    forma.bindTooltip(s.nombre, { direction: 'top', sticky: true });
    forma.addTo(capaSitios);
  }
  let fuera = 0;
  for (const c of checadas) {
    const clase = claseChecada(c);
    if (clase === 'fuera') fuera++;
    const d = describirChecada(c, porId.get(c.sitio_id)?.nombre, horaCorta);
    const ventana = document.createElement('div');
    ventana.className = 'mapa-ventana';
    const t = document.createElement('p'); t.className = 'mapa-ventana__titulo'; t.textContent = d.persona;
    ventana.append(t, texto('Checada', d.detalle), texto('Zona', d.zona), texto('Sitio', d.sitio), texto('Distancia', d.distancia), texto('Precisión estimada', d.precision));
    if (d.revisar) { const r = document.createElement('a'); r.href = '#seccion-revision'; r.textContent = 'Ver en la bandeja de revisión'; ventana.append(r); }
    // Margen de precisión estimada como círculo tenue; el punto encima, con área táctil amplia
    if (c.precision_m) L.circle([c.lat, c.lon], { radius: c.precision_m, className: `mapa-precision mapa-precision--${clase}`, interactive: false, weight: 1 }).addTo(capaChecadas);
    const punto = L.circleMarker([c.lat, c.lon], { radius: 8, className: `mapa-checada mapa-checada--${clase}`, weight: 3 })
      .bindPopup(ventana, { autoPanPadding: [56, 24], maxWidth: 280 }).bindTooltip(`${d.persona} · ${d.detalle}`, { direction: 'top' }).addTo(capaChecadas);
    punto.on('popupopen', () => punto.closeTooltip());
    limites.push([c.lat, c.lon]);
  }
  // Encuadre: las checadas del día; si no hay, todos los sitios
  if (!limites.length) for (const s of sitios) limites.push([s.lat, s.lon]);
  if (limites.length) mapa.fitBounds(limites, { padding: [32, 32], maxZoom: 17 });
  else mapa.setView(CENTRO_POR_DEFECTO, 12);
  setTimeout(() => mapa.invalidateSize(), 0);
  return { sitios: sitios.length, checadas: checadas.length, fuera };
}
