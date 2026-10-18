// HU-38 · Manual de réplica: la instalación completa está al día con las migraciones y el manual documenta cada
// regla configurable que usa el código (si se agrega una regla nueva sin documentarla, esta prueba falla).
// Los bloques SQL del manual se prueban en supabase/tests/pruebas_replica.sh (lo corre correr_pruebas.sh).
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';

const RAIZ = new URL('..', import.meta.url);
const leer = (f) => readFileSync(new URL(f, RAIZ), 'utf8');

test('supabase/instalacion_completa.sql es la suma al día de todas las migraciones', async () => {
  const { armarInstalacion } = await import('../supabase/armar_instalacion.mjs');
  expect(leer('supabase/instalacion_completa.sql'), 'corre: node supabase/armar_instalacion.mjs').toBe(armarInstalacion());
  for (const m of readdirSync(new URL('supabase/migrations/', RAIZ))) expect(leer('supabase/instalacion_completa.sql')).toContain(`>>>>>>>>>> ${m} <<<<<<<<<<`);
});

test('el manual documenta todas las reglas configurables que usa el código', () => {
  const claves = new Set();
  const agregar = (texto, re) => { for (const m of texto.matchAll(re)) claves.add(m[1]); };
  const js = readdirSync(new URL('js/', RAIZ)).filter((f) => f.endsWith('.js')).map((f) => leer(`js/${f}`)).join('\n')
    + leer('supabase/functions/avisos/logica.js');
  agregar(js, /config\??\.([a-z]+_[a-z_]+)/g);                         // config.tolerancia_entrada_min, config?.dias_para_corregir
  agregar(js, /cfg\.([a-z]+_[a-z_]+|rfc|domicilio)/g);                   // datos del reporte
  agregar(js, /c\.(meta_[a-z_]+|jornada_semanal_horas|tolerancia_entrada_min)/g);
  agregar(js, /(?:DEFECTO|METAS) = \{([^}]*)\}/g);
  for (const bloque of [...claves].filter((c) => c.includes(':'))) {
    claves.delete(bloque);
    for (const m of bloque.matchAll(/([a-z]+_[a-z_]+):/g)) claves.add(m[1]);
  }
  const sql = readdirSync(new URL('supabase/migrations/', RAIZ)).map((f) => leer(`supabase/migrations/${f}`)).join('\n');
  agregar(sql, /(?:cfg|config) ?->>? ?'([a-z_]+)'/g);
  agregar(sql, /'([a-z]+_[a-z_]+)',\s+[\w'#]+,?\s+--/g);                // valores por omisión de organizaciones.config
  claves.delete('color_primario');                                       // se cambia desde el panel (Marca)
  claves.delete('horario_tipo');                                         // se ajusta por persona en el panel
  expect(claves.size).toBeGreaterThan(18);
  const manual = leer('docs/REPLICA.md');
  const faltan = [...claves].filter((c) => !manual.includes(`'${c}'`));
  expect(faltan, 'reglas sin documentar en docs/REPLICA.md (paso 3)').toEqual([]);
});
