// ZIP mínimo (sin compresión, "stored") en JavaScript puro, para el respaldo (HU-34). Sin librerías ni npm.
// Sin compresión: lo abre cualquier sistema (Windows, Mac, teléfono) y los archivos dentro quedan idénticos byte
// por byte, así su huella SHA-256 coincide con la del LEEME.
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// Fecha y hora en formato MS-DOS (la que guardan los ZIP)
function fechaDos(d) {
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    fecha: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  };
}

// archivos: [{ nombre, bytes: Uint8Array }] → Uint8Array con el ZIP
export function armarZip(archivos, fecha = new Date()) {
  const enc = new TextEncoder();
  const { hora, fecha: dia } = fechaDos(fecha);
  const partes = [], central = [];
  let desplazamiento = 0;
  for (const a of archivos) {
    const nombre = enc.encode(a.nombre);
    const crc = crc32(a.bytes);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);   // UTF-8
    local.setUint16(8, 0, true); local.setUint16(10, hora, true); local.setUint16(12, dia, true);
    local.setUint32(14, crc, true); local.setUint32(18, a.bytes.length, true); local.setUint32(22, a.bytes.length, true);
    local.setUint16(26, nombre.length, true); local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nombre, a.bytes);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true); c.setUint16(12, hora, true); c.setUint16(14, dia, true);
    c.setUint32(16, crc, true); c.setUint32(20, a.bytes.length, true); c.setUint32(24, a.bytes.length, true);
    c.setUint16(28, nombre.length, true); c.setUint32(42, desplazamiento, true);
    central.push(new Uint8Array(c.buffer), nombre);
    desplazamiento += 30 + nombre.length + a.bytes.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true); fin.setUint32(16, desplazamiento, true);
  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const salida = new Uint8Array(todo.reduce((s, p) => s + p.length, 0));
  let i = 0;
  for (const p of todo) { salida.set(p, i); i += p.length; }
  return salida;
}
